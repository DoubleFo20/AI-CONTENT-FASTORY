import { z } from 'zod';
import { CloudJobSchema, type CloudJob } from '../../shared/integrations.js';
import {
  DEFAULT_WORKER_PRESENCE_TTL_MS, WorkerHeartbeatSchema, WorkerPresenceSchema, WorkerPrincipalSchema,
  type WorkerHeartbeat, type WorkerJobDisplayStatus, type WorkerPresence, type WorkerPrincipal,
} from '../../shared/worker.js';
import { AppError } from '../errors.js';

/** PREPARED pure transitions only. Activation requires broker authentication and atomic
 * durable compare-and-swap of the previous state. No enrollment, credential validation,
 * pairing, media bridge, queue mutation or job-lease renewal is provided here. */
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError('INVALID_INPUT');
  return result.data;
}

function serverTimestamp(now: number): string {
  if (!Number.isSafeInteger(now) || now < 0) throw new AppError('INVALID_INPUT');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new AppError('INVALID_INPUT');
  return parse(z.iso.datetime(), date.toISOString());
}

function checkedPresence(previous: WorkerPresence, principal: WorkerPrincipal, now: number): WorkerPresence {
  const identity = parse(WorkerPrincipalSchema, principal);
  const presence = parse(WorkerPresenceSchema, previous);
  if (presence.ownerId !== identity.ownerId || presence.workerId !== identity.workerId) throw new AppError('NOT_FOUND', 404);
  if (Date.parse(presence.lastSeenAt) > now) throw new AppError('INVALID_INPUT');
  return presence;
}

function checkedTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new AppError('INVALID_INPUT');
}

/** The epoch must be a new UUID supplied by the trusted broker, never client enrollment. */
export function beginWorkerConnection(previous: WorkerPresence | null, principal: WorkerPrincipal, connectionEpoch: string, now: number): WorkerPresence {
  const lastSeenAt = serverTimestamp(now);
  const identity = parse(WorkerPrincipalSchema, principal);
  const epoch = parse(z.uuid(), connectionEpoch);
  if (previous) {
    const presence = checkedPresence(previous, identity, now);
    if (presence.revoked || presence.connectionEpoch === epoch) throw new AppError('CONFLICT', 409);
  }
  // sequence 0 is connected but ineligible until the first accepted heartbeat.
  return { ...identity, connectionEpoch: epoch, sequence: 0, lastSeenAt, revoked: false };
}

export function heartbeatWorkerPresence(previous: WorkerPresence, principal: WorkerPrincipal, heartbeat: WorkerHeartbeat, now: number): WorkerPresence {
  const lastSeenAt = serverTimestamp(now);
  const presence = checkedPresence(previous, principal, now);
  const input = parse(WorkerHeartbeatSchema, heartbeat);
  if (presence.revoked || presence.connectionEpoch !== input.connectionEpoch || input.sequence <= presence.sequence) throw new AppError('CONFLICT', 409);
  return { ...presence, sequence: input.sequence, lastSeenAt };
}

export function revokeWorkerPresence(previous: WorkerPresence, principal: WorkerPrincipal, now: number): WorkerPresence {
  serverTimestamp(now);
  return { ...checkedPresence(previous, principal, now), revoked: true };
}

export function isWorkerEligible(previous: WorkerPresence | null, principal: WorkerPrincipal, now: number, ttlMs = DEFAULT_WORKER_PRESENCE_TTL_MS): boolean {
  serverTimestamp(now); checkedTtl(ttlMs);
  parse(WorkerPrincipalSchema, principal);
  if (!previous) return false;
  const presence = checkedPresence(previous, principal, now);
  return !presence.revoked && presence.sequence > 0 && now - Date.parse(presence.lastSeenAt) < ttlMs;
}

/** Display projection only. Presence can never revive, claim or complete a job. */
export function workerJobDisplayStatus(job: CloudJob, presences: readonly WorkerPresence[], now: number, ttlMs = DEFAULT_WORKER_PRESENCE_TTL_MS): WorkerJobDisplayStatus {
  serverTimestamp(now); checkedTtl(ttlMs);
  const valid = parse(CloudJobSchema, job);
  if (valid.status !== 'queued' || valid.target !== 'local' || valid.type !== 'export') return valid.status;
  const eligible = presences.some(value => {
    const presence = parse(WorkerPresenceSchema, value);
    return presence.ownerId === valid.ownerId && isWorkerEligible(presence, { ownerId: presence.ownerId, workerId: presence.workerId }, now, ttlMs);
  });
  return eligible ? valid.status : 'WAITING_FOR_WORKER';
}
