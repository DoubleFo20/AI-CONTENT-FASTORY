import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { CloudJob, CloudProjectSnapshot } from '../shared/integrations.js';
import { DEFAULT_WORKER_PRESENCE_TTL_MS, type WorkerHeartbeat, type WorkerPresence, type WorkerPrincipal } from '../shared/worker.js';
import {
  beginWorkerConnection, heartbeatWorkerPresence, isWorkerEligible, revokeWorkerPresence, workerJobDisplayStatus,
} from '../server/cloud/presence.js';
import { MemoryCloudRepository } from '../server/cloud/memory.js';
import { AppError } from '../server/errors.js';

const principal: WorkerPrincipal = { ownerId: randomUUID(), workerId: 'laptop_1' };
const start = Date.UTC(2026, 9, 10);
const errorIs = (code: string) => (error: unknown) => error instanceof AppError && error.code === code && error.message === code;
const connected = () => beginWorkerConnection(null, principal, randomUUID(), start);
const online = () => {
  const presence = connected();
  return heartbeatWorkerPresence(presence, principal, { connectionEpoch: presence.connectionEpoch, sequence: 1 }, start + 1);
};
function job(status: CloudJob['status'] = 'queued', target: CloudJob['target'] = 'local'): CloudJob {
  return { id: randomUUID(), ownerId: principal.ownerId, projectId: randomUUID(), type: target === 'local' ? 'export' : 'ideas', target,
    status, progress: status === 'completed' ? 100 : 0, errorCode: status === 'failed' ? 'INTERRUPTED' : null,
    createdAt: new Date(start).toISOString(), updatedAt: new Date(start).toISOString() };
}

test('connection needs a first heartbeat; TTL is offline at the exact default or custom boundary', () => {
  const presence = connected();
  assert.equal(isWorkerEligible(null, principal, start), false);
  assert.equal(presence.sequence, 0);
  assert.equal(isWorkerEligible(presence, principal, start), false);
  const seen = online();
  const lastSeen = Date.parse(seen.lastSeenAt);
  assert.equal(isWorkerEligible(seen, principal, lastSeen), true);
  assert.equal(isWorkerEligible(seen, principal, lastSeen + DEFAULT_WORKER_PRESENCE_TTL_MS - 1), true);
  assert.equal(isWorkerEligible(seen, principal, lastSeen + DEFAULT_WORKER_PRESENCE_TTL_MS), false);
  assert.equal(isWorkerEligible(seen, principal, lastSeen + 499, 500), true);
  assert.equal(isWorkerEligible(seen, principal, lastSeen + 500, 500), false);
});

test('all transitions reject a different owner or worker instead of reassigning persisted identity', () => {
  const seen = online();
  for (const wrong of [{ ...principal, ownerId: randomUUID() }, { ...principal, workerId: 'laptop_2' }]) {
    assert.throws(() => beginWorkerConnection(seen, wrong, randomUUID(), start + 2), errorIs('NOT_FOUND'));
    assert.throws(() => heartbeatWorkerPresence(seen, wrong, { connectionEpoch: seen.connectionEpoch, sequence: 2 }, start + 2), errorIs('NOT_FOUND'));
    assert.throws(() => revokeWorkerPresence(seen, wrong, start + 2), errorIs('NOT_FOUND'));
    assert.throws(() => isWorkerEligible(seen, wrong, start + 2), errorIs('NOT_FOUND'));
  }
});

test('reconnect resets sequence, requires a new epoch and fences old or forged heartbeats', () => {
  const seen = online();
  assert.throws(() => beginWorkerConnection(seen, principal, seen.connectionEpoch, start + 2), errorIs('CONFLICT'));
  const reconnected = beginWorkerConnection(seen, principal, randomUUID(), start + 2);
  assert.equal(reconnected.sequence, 0);
  assert.equal(isWorkerEligible(reconnected, principal, start + 2), false);
  for (const connectionEpoch of [seen.connectionEpoch, randomUUID()]) {
    assert.throws(() => heartbeatWorkerPresence(reconnected, principal, { connectionEpoch, sequence: 2 }, start + 3), errorIs('CONFLICT'));
  }
  const accepted = heartbeatWorkerPresence(reconnected, principal, { connectionEpoch: reconnected.connectionEpoch, sequence: 1 }, start + 3);
  assert.equal(isWorkerEligible(accepted, principal, start + 3), true);
});

test('duplicate/out-of-order sequences cannot renew presence, including the maximum safe integer', () => {
  const seen = online();
  const next = heartbeatWorkerPresence(seen, principal, { connectionEpoch: seen.connectionEpoch, sequence: 10 }, start + 2);
  for (const sequence of [1, 9, 10]) {
    assert.throws(() => heartbeatWorkerPresence(next, principal, { connectionEpoch: next.connectionEpoch, sequence }, start + 3), errorIs('CONFLICT'));
  }
  assert.equal(next.lastSeenAt, new Date(start + 2).toISOString());
  const maximum = heartbeatWorkerPresence(next, principal, { connectionEpoch: next.connectionEpoch, sequence: Number.MAX_SAFE_INTEGER }, start + 3);
  assert.throws(() => heartbeatWorkerPresence(maximum, principal, { connectionEpoch: maximum.connectionEpoch, sequence: Number.MAX_SAFE_INTEGER }, start + 4), errorIs('CONFLICT'));
  for (const sequence of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
    assert.throws(() => heartbeatWorkerPresence(next, principal, { connectionEpoch: next.connectionEpoch, sequence }, start + 3), errorIs('INVALID_INPUT'));
  }
});

test('server clock rejects invalid time or rollback and heartbeat payload cannot supply a client timestamp', () => {
  const seen = online();
  for (const now of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 8_640_000_000_000_001, start]) {
    assert.throws(() => beginWorkerConnection(seen, principal, randomUUID(), now), errorIs('INVALID_INPUT'));
    assert.throws(() => heartbeatWorkerPresence(seen, principal, { connectionEpoch: seen.connectionEpoch, sequence: 2 }, now), errorIs('INVALID_INPUT'));
    assert.throws(() => revokeWorkerPresence(seen, principal, now), errorIs('INVALID_INPUT'));
    assert.throws(() => isWorkerEligible(seen, principal, now), errorIs('INVALID_INPUT'));
  }
  const clientTimestamp = { connectionEpoch: seen.connectionEpoch, sequence: 2, lastSeenAt: new Date(start + 1_000_000).toISOString() };
  assert.throws(() => heartbeatWorkerPresence(seen, principal, clientTimestamp, start + 2), errorIs('INVALID_INPUT'));
  assert.throws(() => isWorkerEligible({ ...seen, lastSeenAt: 'invalid' }, principal, start + 2), errorIs('INVALID_INPUT'));
  const sameTick = heartbeatWorkerPresence(seen, principal, { connectionEpoch: seen.connectionEpoch, sequence: 2 }, start + 1);
  assert.equal(sameTick.lastSeenAt, seen.lastSeenAt);
});

test('revocation is idempotent and fences heartbeat, eligibility and reconnect permanently for that record', () => {
  const seen = online();
  const revoked = revokeWorkerPresence(seen, principal, start + 2);
  assert.equal(revoked.lastSeenAt, seen.lastSeenAt);
  assert.deepEqual(revokeWorkerPresence(revoked, principal, start + 3), revoked);
  assert.equal(isWorkerEligible(revoked, principal, start + 3), false);
  assert.throws(() => heartbeatWorkerPresence(revoked, principal, { connectionEpoch: revoked.connectionEpoch, sequence: 2 }, start + 3), errorIs('CONFLICT'));
  assert.throws(() => beginWorkerConnection(revoked, principal, randomUUID(), start + 3), errorIs('CONFLICT'));
});

test('strict principal, presence, epoch and TTL validation fails closed', () => {
  const seen = online();
  for (const identity of [{ ...principal, ownerId: 'invalid' }, { ...principal, workerId: '../device' }, { ...principal, credential: 'not_a_credential' }]) {
    assert.throws(() => beginWorkerConnection(null, identity, randomUUID(), start + 2), errorIs('INVALID_INPUT'));
  }
  assert.throws(() => beginWorkerConnection(null, principal, 'invalid', start), errorIs('INVALID_INPUT'));
  assert.throws(() => heartbeatWorkerPresence(seen, principal, { connectionEpoch: 'invalid', sequence: 2 }, start + 2), errorIs('INVALID_INPUT'));
  const malformed = { ...seen, sequence: -1 };
  assert.throws(() => isWorkerEligible(malformed, principal, start + 2), errorIs('INVALID_INPUT'));
  for (const ttlMs of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => isWorkerEligible(seen, principal, start + 2, ttlMs), errorIs('INVALID_INPUT'));
    assert.throws(() => workerJobDisplayStatus(job(), [seen], start + 2, ttlMs), errorIs('INVALID_INPUT'));
  }
});

test('job projection waits only for queued local export without an eligible same-owner worker', () => {
  const queued = job();
  const seen = online();
  const foreign = { ...seen, ownerId: randomUUID() };
  const revoked = revokeWorkerPresence(seen, principal, start + 2);
  for (const presences of [[], [connected()], [foreign], [revoked]]) {
    assert.equal(workerJobDisplayStatus(queued, presences, start + 2), 'WAITING_FOR_WORKER');
  }
  assert.equal(workerJobDisplayStatus(queued, [foreign, seen], start + 2), 'queued');
  assert.equal(workerJobDisplayStatus(queued, [seen], start + 1 + DEFAULT_WORKER_PRESENCE_TTL_MS), 'WAITING_FOR_WORKER');
  for (const status of ['queued', 'running', 'completed', 'failed'] as const) {
    assert.equal(workerJobDisplayStatus(job(status, 'cloud'), [], start + 2), status);
    if (status !== 'queued') {
      assert.equal(workerJobDisplayStatus(job(status), [], start + 2), status);
      assert.equal(workerJobDisplayStatus(job(status), [seen], start + 2), status);
    }
  }
  assert.throws(() => workerJobDisplayStatus(queued, [{ ...seen, lastSeenAt: new Date(start + 3).toISOString() }], start + 2), errorIs('INVALID_INPUT'));
});

test('transitions and projections do not mutate or retain mutable input references', () => {
  const identity = Object.freeze({ ...principal });
  const initial = Object.freeze(beginWorkerConnection(null, identity, randomUUID(), start));
  const heartbeat: WorkerHeartbeat = Object.freeze({ connectionEpoch: initial.connectionEpoch, sequence: 1 });
  const seen = Object.freeze(heartbeatWorkerPresence(initial, identity, heartbeat, start + 1));
  const original = structuredClone({ initial, seen, heartbeat, identity });
  const revoked = revokeWorkerPresence(seen, identity, start + 2);
  const reconnected = beginWorkerConnection(seen, identity, randomUUID(), start + 2);
  const queued = Object.freeze(job());
  assert.equal(workerJobDisplayStatus(queued, Object.freeze([seen]), start + 2), 'queued');
  revoked.workerId = 'changed'; reconnected.ownerId = randomUUID();
  assert.deepEqual({ initial, seen, heartbeat, identity }, original);
  assert.equal(queued.status, 'queued');
});

test('presence heartbeat and reconnect never extend a real job lease or replay expired work', async () => {
  let now = start;
  const repository = new MemoryCloudRepository({ now: () => now, leaseMs: 1000 });
  const snapshot: CloudProjectSnapshot = { id: randomUUID(), ownerId: principal.ownerId,
    brief: { name: 'Train', brief: 'A traveller remembers the last train.', genre: 'Fantasy', audience: 'General', aspectRatio: '9:16' },
    ideas: [], selectedIdeaId: null, package: null, revision: 1 };
  await repository.saveProject(principal.ownerId, snapshot);
  await repository.enqueue(principal.ownerId, snapshot.id, { type: 'ideas', brief: snapshot.brief });
  const lease = (await repository.claim(principal.workerId, 'cloud'))!;
  const originalLease = structuredClone(lease);
  let presence: WorkerPresence = connected();
  now += 800;
  presence = heartbeatWorkerPresence(presence, principal, { connectionEpoch: presence.connectionEpoch, sequence: 1 }, now);
  now += 200;
  const reconnected = beginWorkerConnection(presence, principal, randomUUID(), now);
  assert.equal(isWorkerEligible(reconnected, principal, now), false);
  assert.equal(await repository.heartbeat(lease, 10), false);
  assert.equal((await repository.jobs(principal.ownerId, snapshot.id))[0].errorCode, 'INTERRUPTED');
  assert.equal(await repository.claim(principal.workerId, 'cloud'), null);
  assert.deepEqual(lease, originalLease);
  assert.deepEqual(await repository.project(principal.ownerId, snapshot.id), snapshot);
});
