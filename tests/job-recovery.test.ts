import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Idea, ProjectInput } from '../shared/contracts.js';
import type { AiProvider } from '../server/ai/types.js';
import { createMockProvider } from '../server/ai/mock.js';
import { AppError } from '../server/errors.js';
import { Store } from '../server/store.js';
import { Worker, type WorkerOptions } from '../server/worker.js';

const input: ProjectInput = { name: 'Recovery QA', brief: 'A traveler finds a lost umbrella in the rain.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function fixture(t: TestContext, provider: AiProvider = createMockProvider(), options: WorkerOptions = {}) {
  const parent = resolve('.tmp');
  await mkdir(parent, { recursive: true });
  const dir = await mkdtemp(join(parent, 'job-recovery-'));
  const store = new Store(dir);
  const owner = store.createOwner('synthetic_owner', 'synthetic_hash');
  const worker = new Worker(store, provider, { aiStatus: () => ({ active: 'mock' }), ...options });
  t.after(async () => { await worker.stop(); store.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, store, owner, worker, project: store.createProject(owner.id, input) };
}
const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;

test('queued cancellation is owner checked, terminal, and requires explicit retry', async (t) => {
  let calls = 0;
  const mock = createMockProvider();
  const f = await fixture(t, { ...mock, generateIdeas: async () => { calls += 1; return mock.generateIdeas(input); } });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  assert.throws(() => f.worker.cancel('another_owner', queued.id), code('NOT_FOUND'));
  assert.equal(f.worker.cancel(f.owner.id, queued.id).errorCode, 'JOB_CANCELLED');
  assert.equal(f.worker.cancel(f.owner.id, queued.id).status, 'failed');
  assert.equal(await f.worker.runNext(), false);
  assert.equal(calls, 0);
  const retry = f.store.retry(f.owner.id, queued.id);
  assert.notEqual(retry.id, queued.id);
  assert.equal(await f.worker.runNext(), true);
  assert.equal(calls, 1);
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_CANCELLED');
  assert.throws(() => f.worker.cancel(f.owner.id, retry.id), code('CONFLICT'));
});

test('running cancellation aborts provider, retains serialization, and fences late success', async (t) => {
  const first = deferred<Idea[]>();
  const mock = createMockProvider();
  let signal: AbortSignal | undefined;
  let calls = 0;
  const f = await fixture(t, { ...mock, generateIdeas: async (_input, options) => {
    calls += 1; signal = options?.signal;
    return calls === 1 ? first.promise : mock.generateIdeas(input);
  } }, { jobTimeoutMs: 1000 });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const running = f.worker.runNext();
  assert.equal(f.worker.status(f.owner.id).activeJobId, queued.id);
  assert.equal(f.worker.status('another_owner').activeJobId, null);
  assert.equal(f.store.job(f.owner.id, queued.id).progress, 15);
  f.worker.cancel(f.owner.id, queued.id);
  assert.equal(signal?.aborted, true);
  const retry = f.store.retry(f.owner.id, queued.id);
  assert.equal(f.worker.runNext(), running);
  assert.equal(calls, 1);
  first.resolve(await mock.generateIdeas(input));
  await running;
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_CANCELLED');
  assert.equal(f.store.project(f.owner.id, f.project.id).ideas.length, 0);
  assert.equal(f.store.project(f.owner.id, f.project.id).generation, undefined);
  await f.worker.runNext();
  assert.equal(calls, 2);
  assert.equal(f.store.job(f.owner.id, retry.id).status, 'completed');
});

test('a provider respecting abort ends cancellation promptly without committing output', async (t) => {
  const mock = createMockProvider();
  const f = await fixture(t, { ...mock, generateIdeas: async (_input, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('private cancellation detail')), { once: true });
  }) });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const running = f.worker.runNext();
  f.worker.cancel(f.owner.id, queued.id);
  await running;
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_CANCELLED');
  assert.equal(f.worker.status(f.owner.id).activeJobId, null);
});

test('an ignoring cancelled request keeps its serial slot until the original deadline', async (t) => {
  const mock = createMockProvider();
  const old = deferred<Idea[]>();
  let calls = 0;
  const f = await fixture(t, { ...mock, generateIdeas: async () => {
    calls += 1;
    return calls === 1 ? old.promise : mock.generateIdeas(input);
  } }, { jobTimeoutMs: 30 });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const running = f.worker.runNext();
  f.worker.cancel(f.owner.id, queued.id);
  const retry = f.store.retry(f.owner.id, queued.id);
  assert.equal(f.worker.runNext(), running);
  assert.equal(calls, 1);
  await running;
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_CANCELLED');
  assert.equal(f.store.job(f.owner.id, retry.id).status, 'queued');
  assert.equal(f.worker.hasOutstanding(), true);
  assert.throws(() => f.worker.assertAvailable(f.owner.id, f.project.id), code('CONFLICT'));
  assert.equal(await f.worker.runNext(), false);
  assert.equal(calls, 1);
  old.resolve(await mock.generateIdeas(input));
  await new Promise<void>(done => setImmediate(done));
  assert.equal(f.worker.hasOutstanding(), false);
  await f.worker.runNext();
  assert.equal(calls, 2);
  assert.equal(f.store.job(f.owner.id, retry.id).status, 'completed');
});

test('deadline bounds an ignoring provider, blocks overlap, and permits other projects safely', async (t) => {
  const old = deferred<Idea[]>();
  const mock = createMockProvider();
  let calls = 0;
  let oldSignal: AbortSignal | undefined;
  const f = await fixture(t, { ...mock, generateIdeas: async (_input, options) => {
    calls += 1;
    if (calls === 1) { oldSignal = options?.signal; return old.promise; }
    return mock.generateIdeas(input);
  } }, { jobTimeoutMs: 30 });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  await f.worker.runNext();
  assert.equal(oldSignal?.aborted, true);
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_TIMEOUT');
  assert.equal(f.worker.status(f.owner.id).lastErrorCode, 'JOB_TIMEOUT');
  assert.equal(f.worker.status(f.owner.id).state, 'running');
  assert.equal(f.worker.status(f.owner.id).activeJobId, queued.id);
  assert.throws(() => f.worker.assertAvailable(f.owner.id, f.project.id), code('CONFLICT'));
  assert.equal(await f.worker.runNext(), false);
  assert.equal(calls, 1);
  f.store.retry(f.owner.id, queued.id);
  assert.equal(await f.worker.runNext(), false);
  assert.equal(calls, 1);
  const other = f.store.createProject(f.owner.id, { ...input, name: 'Another project' });
  f.worker.assertAvailable(f.owner.id, other.id);
  f.store.enqueue(f.owner.id, other.id, 'ideas');
  await f.worker.runNext();
  const committed = f.store.project(f.owner.id, f.project.id);
  assert.equal(committed.ideas.length, 0);
  assert.equal(f.store.project(f.owner.id, other.id).ideas.length, 10);
  const stale = (await mock.generateIdeas(input)).map(idea => ({ ...idea, id: `stale_${idea.id}` }));
  old.resolve(stale);
  await new Promise<void>(done => setImmediate(done));
  assert.deepEqual(f.store.project(f.owner.id, f.project.id), committed);
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'JOB_TIMEOUT');
  f.worker.assertAvailable(f.owner.id, f.project.id);
  await f.worker.runNext();
  assert.equal(f.store.project(f.owner.id, f.project.id).ideas.length, 10);
  assert.equal(calls, 3);
});

test('shutdown is bounded for an ignoring provider and fences late output after store close', async (t) => {
  const old = deferred<Idea[]>();
  const mock = createMockProvider();
  let signal: AbortSignal | undefined;
  const f = await fixture(t, { ...mock, generateIdeas: async (_input, options) => { signal = options?.signal; return old.promise; } }, { shutdownTimeoutMs: 20 });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const running = f.worker.runNext();
  await f.worker.stop();
  await running;
  assert.equal(signal?.aborted, true);
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'INTERRUPTED');
  assert.equal(f.worker.status(f.owner.id).state, 'stopped');
  assert.equal(await f.worker.runNext(), false);
  f.store.close();
  old.resolve(await mock.generateIdeas(input));
  await new Promise<void>(done => setImmediate(done));
});

test('polling survives claim failure and records only safe runtime codes', async (t) => {
  const started = deferred<void>();
  const mock = createMockProvider();
  const f = await fixture(t, { ...mock, generateIdeas: async () => { started.resolve(); return mock.generateIdeas(input); } }, { pollIntervalMs: 5 });
  const claim = f.store.claim.bind(f.store);
  let failures = 2;
  f.store.claim = (excluded) => { if (failures-- > 0) throw new Error('private database details'); return claim(excluded); };
  f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  assert.equal(await f.worker.runNext(), false);
  assert.deepEqual(f.worker.status(f.owner.id), { state: 'failed', activeJobId: null, lastErrorCode: 'WORKER_UNAVAILABLE' });
  f.worker.start();
  await started.promise;
  await f.worker.runNext();
  assert.equal(f.store.project(f.owner.id, f.project.id).ideas.length, 10);
});

test('polling also survives persistence failure without exposing exception details', async (t) => {
  const mock = createMockProvider();
  const f = await fixture(t, { ...mock, generateIdeas: async () => { throw new Error('private provider details'); } });
  const fail = f.store.failJob.bind(f.store);
  f.store.failJob = () => { throw new Error('private write details'); };
  f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  assert.equal(await f.worker.runNext(), false);
  assert.equal(f.worker.status(f.owner.id).lastErrorCode, 'WORKER_UNAVAILABLE');
  f.store.failJob = fail;
  const other = f.store.createProject(f.owner.id, input);
  const queued = f.store.enqueue(f.owner.id, other.id, 'ideas');
  assert.equal(await f.worker.runNext(), true);
  assert.equal(f.store.job(f.owner.id, queued.id).errorCode, 'AI_REQUEST_FAILED');
});

test('restart interrupts running and queued AI without paid replay or a schema change', async (t) => {
  const f = await fixture(t);
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const other = f.store.createProject(f.owner.id, input);
  const running = f.store.enqueue(f.owner.id, other.id, 'ideas');
  const before = new DatabaseSync(join(f.dir, 'factory.sqlite'));
  before.prepare("UPDATE jobs SET status='running' WHERE id=?").run(running.id);
  const schema = before.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY name").all();
  before.close();
  await f.worker.stop(); f.store.close();
  const restarted = new Store(f.dir);
  let calls = 0;
  const mock = createMockProvider();
  const worker = new Worker(restarted, { ...mock, generateIdeas: async () => { calls += 1; return mock.generateIdeas(input); } });
  try {
    for (const id of [queued.id, running.id]) {
      assert.equal(restarted.job(f.owner.id, id).status, 'failed');
      assert.equal(restarted.job(f.owner.id, id).errorCode, 'INTERRUPTED');
    }
    assert.equal(await worker.runNext(), false);
    assert.equal(calls, 0);
    const after = new DatabaseSync(join(f.dir, 'factory.sqlite'));
    assert.equal(after.prepare('PRAGMA user_version').get()?.user_version, 1);
    assert.deepEqual(after.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY name").all(), schema);
    after.close();
    restarted.retry(f.owner.id, queued.id);
    await worker.runNext();
    assert.equal(calls, 1);
  } finally { await worker.stop(); restarted.close(); }
});

test('valid cached ideas reject regeneration and persist sanitized provenance without schema additions', async (t) => {
  const mock = createMockProvider();
  let calls = 0;
  let active: 'mock' | 'openai' = 'openai';
  const f = await fixture(t, { ...mock, generateIdeas: async () => { calls += 1; active = 'mock'; return mock.generateIdeas(input); } }, { aiStatus: () => ({ active }) });
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  await f.worker.runNext();
  assert.equal(f.store.job(f.owner.id, queued.id).progress, 100);
  assert.deepEqual(f.store.project(f.owner.id, f.project.id).generation, { ideas: 'mock' });
  assert.throws(() => f.store.enqueue(f.owner.id, f.project.id, 'ideas'), code('CONFLICT'));
  assert.equal(calls, 1);
  f.store.select(f.owner.id, f.project.id, 'mock_idea_1');
  active = 'openai';
  f.store.enqueue(f.owner.id, f.project.id, 'expand');
  await f.worker.runNext();
  assert.deepEqual(f.store.project(f.owner.id, f.project.id).generation, { ideas: 'mock', expansion: 'openai' });
  const db = new DatabaseSync(join(f.dir, 'factory.sqlite'));
  const stored = JSON.parse(String(db.prepare('SELECT input_json FROM projects WHERE id=?').get(f.project.id)?.input_json));
  assert.deepEqual(stored._generation, { ideas: 'mock', expansion: 'openai' });
  db.prepare('UPDATE projects SET input_json=? WHERE id=?').run(JSON.stringify({ ...stored, _internal: 'private marker', unsupported: 'private marker' }), f.project.id);
  db.close();
  const summary = f.store.listProjects(f.owner.id)[0];
  assert.equal('_generation' in summary, false);
  assert.equal('_internal' in summary, false);
  assert.equal('unsupported' in summary, false);
});

test('all completion and failure paths fence cancelled jobs and preserve newer content', async (t) => {
  const f = await fixture(t);
  const mock = createMockProvider();
  const ideas = await mock.generateIdeas(input);
  const queued = f.store.enqueue(f.owner.id, f.project.id, 'ideas');
  const claimed = f.store.claim()!.job;
  f.store.cancel(f.owner.id, queued.id);
  assert.equal(f.store.completeIdeas(claimed, ideas, 'openai'), false);
  assert.equal(f.store.failJob(claimed.id, 'AI_REQUEST_FAILED'), false);
  assert.equal(f.store.updateProgress(claimed.id, 70), false);
  f.store.retry(f.owner.id, queued.id);
  await f.worker.runNext();
  f.store.select(f.owner.id, f.project.id, 'mock_idea_1');
  const expansion = f.store.enqueue(f.owner.id, f.project.id, 'expand');
  const expanding = f.store.claim()!.job;
  const story = await mock.expandStory(input, ideas[0]);
  f.store.cancel(f.owner.id, expansion.id);
  assert.equal(f.store.completePackage(expanding, story, 'openai'), false);
  assert.equal(f.store.completeExport(expanding, 'synthetic.mp4', '9:16'), false);
  const project = f.store.project(f.owner.id, f.project.id);
  assert.equal(project.package, null);
  assert.equal(project.export, null);
  assert.deepEqual(project.generation, { ideas: 'mock' });
  assert.equal(f.store.completeIdeas(claimed, [], 'openai'), false);
  assert.equal(f.store.project(f.owner.id, f.project.id).ideas.length, 10);
});
