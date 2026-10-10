import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { DriveError, type DriveIntegration, type DriveMedia, type DriveProjectFolders, type DriveUpload } from '../server/storage/types.js';
import type { AiProvider } from '../server/ai/types.js';
import type { Idea, ProjectInput, StoryPackage } from '../shared/contracts.js';

const origin = 'http://127.0.0.1:5173';
const input: ProjectInput = { name: 'Storage API QA', brief: 'A traveler finds a lost umbrella during a storm.', genre: 'Drama', audience: 'General audience', aspectRatio: '9:16' };
const text = (value: string) => ({ th: `เรื่อง ${value}`, en: `Story ${value}` });
const ideas: Idea[] = Array.from({ length: 10 }, (_, index) => ({ id: `idea_${index + 1}`, title: text(`title ${index + 1}`), logline: text(`logline ${index + 1}`), hook: text(`hook ${index + 1}`) }));
const story: StoryPackage = {
  storyBible: text('bible'),
  characters: [{ id: 'character_1', name: 'Mali', visualDescriptionEn: 'Blue coat', background: text('background') }],
  locations: [{ id: 'location_1', name: text('garden'), visualDescriptionEn: 'Quiet garden', description: text('garden place') }],
  continuityRules: [text('coat remains blue')],
  scenes: [1, 2, 3].map(order => ({ id: `scene_${order}`, order, title: text(`scene ${order}`), durationSeconds: 8, explanationTh: `คำอธิบาย ${order}`, flowPromptEn: `Mali in garden, shot ${order}`, narration: text(`narration ${order}`), characterIds: ['character_1'], locationId: 'location_1' })),
};
const provider: AiProvider = { async generateIdeas() { return structuredClone(ideas); }, async expandStory() { return structuredClone(story); } };

interface Session { cookie: string; csrf: string; username: string }
interface Fixture { base: string; app: Awaited<ReturnType<typeof createApplication>>; dataDir: string; server: Server }
interface FakeDriveState { uploads: number; folderCalls: number; downloads: number; failNext: number; hold: boolean; entered?: () => void; release?: () => void; files: Map<string, Uint8Array>; lastUpload?: DriveUpload; lastError?: string }

function fakeDrive(state: FakeDriveState): DriveIntegration {
  return {
    async status() { return { provider: 'google_drive', configured: true, connected: true, state: 'connected' }; },
    async begin() { return { authorizationUrl: 'https://example.invalid/fake-authorize' }; },
    async callback() {},
    async ensureProjectFolders(_ownerId, projectId): Promise<DriveProjectFolders> {
      state.folderCalls++;
      return { rootId: 'root_folder', projectFolderId: `project_${projectId.replaceAll('-', '')}`, categories: {
        story: 'cat_story', productReview: 'cat_reviews', kidsToy: 'cat_toys', investment: 'cat_investment', sharedAssets: 'cat_shared', archives: 'cat_archives',
      } };
    },
    async upload(_ownerId, upload): Promise<DriveMedia> {
      state.uploads++;
      state.lastUpload = upload;
      state.lastError = undefined;
      try {
        if (state.failNext > 0) { state.failNext--; throw new DriveError('DRIVE_REQUEST_FAILED'); }
        const bytes = upload.bytes ? Buffer.from(upload.bytes) : await readFile(upload.filePath!);
        upload.onProgress?.(Math.floor(bytes.byteLength / 2), bytes.byteLength);
        if (state.hold) {
          state.entered?.();
          await new Promise<void>(resolveGate => { state.release = resolveGate; });
        }
        const id = `remote_file_${state.uploads}`;
        state.files.set(id, bytes);
        return { id, name: upload.name, mimeType: upload.mimeType, size: bytes.byteLength,
          md5Checksum: createHash('md5').update(bytes).digest('hex'), verified: true };
      } catch (error) { state.lastError = error instanceof Error ? error.message : String(error); throw error; }
    },
    async download(_ownerId, fileId) { state.downloads++; const bytes = state.files.get(fileId); if (!bytes) throw new DriveError('DRIVE_NOT_FOUND'); return Uint8Array.from(bytes); },
  };
}

async function fixture(t: TestContext, drive?: DriveIntegration): Promise<Fixture> {
  const root = resolve('.tmp'); await mkdir(root, { recursive: true });
  const dataDir = await mkdtemp(join(root, 'project-storage-api-'));
  const app = await createApplication({ dataDir, provider, allowedOrigins: [origin], startWorker: false, integrations: drive ? { drive } : undefined });
  const server = createServer(app.app);
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>(resolveClose => server.close(() => resolveClose())); await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${address.port}/api`, app, dataDir, server };
}

async function call(base: string, path: string, session?: Session, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (session) headers.set('Cookie', session.cookie);
  if (init.method && init.method !== 'GET' && init.method !== 'HEAD') headers.set('Origin', origin);
  if (session && init.method && init.method !== 'GET' && init.method !== 'HEAD' && session.csrf) headers.set('X-CSRF-Token', session.csrf);
  return fetch(`${base}${path}`, { ...init, headers });
}
async function json<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }

async function createOwner(base: string): Promise<Session> {
  const username = 'storage_owner'; const password = 'qa-storage-password-2026';
  const setup = await call(base, '/auth/setup', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(setup.status, 201);
  const login = await call(base, '/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200);
  const result = await json<{ csrfToken: string }>(login);
  return { cookie: login.headers.get('set-cookie')!.split(';', 1)[0], csrf: result.csrfToken, username };
}

async function createProject(base: string, session: Session): Promise<{ id: string; name: string }> {
  const response = await call(base, '/projects', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(response.status, 201);
  return (await json<{ project: { id: string; name: string } }>(response)).project;
}

async function expandProject(f: Fixture, session: Session): Promise<{ id: string; name: string; sceneId: string }> {
  const project = await createProject(f.base, session);
  assert.equal((await call(f.base, `/projects/${project.id}/ideas`, session, { method: 'POST' })).status, 202);
  assert.equal(await f.app.worker.runNext(), true);
  const ideasReady = await f.app.store.project(f.app.store.credentials(session.username)!.user.id, project.id);
  assert.equal(ideasReady.ideas.length, 10);
  assert.equal((await call(f.base, `/projects/${project.id}/select`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: ideasReady.ideas[0].id }) })).status, 200);
  assert.equal((await call(f.base, `/projects/${project.id}/expand`, session, { method: 'POST' })).status, 202);
  assert.equal(await f.app.worker.runNext(), true);
  const expanded = f.app.store.project(f.app.store.credentials(session.username)!.user.id, project.id);
  assert.ok(expanded.package);
  return { id: expanded.id, name: expanded.name, sceneId: expanded.package.scenes[0].id };
}

async function addSyntheticClip(f: Fixture, session: Session, project: { id: string; sceneId: string }, bytes = Buffer.from('synthetic-private-clip-bytes')) {
  const ownerId = f.app.store.credentials(session.username)!.user.id;
  const filename = `${randomUUID()}.mp4`;
  const path = join(f.dataDir, 'clips', filename);
  await writeFile(path, bytes);
  const clip = f.app.store.addClip(ownerId, project.id, project.sceneId, filename, 'private-input.mp4', 8);
  return { clip, path, bytes };
}

async function createSecondOwner(f: Fixture): Promise<Session> {
  const username = 'storage_other'; const password = 'qa-other-storage-password-2026';
  const db = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  try { db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(randomUUID(), username, await hashPassword(password), new Date().toISOString()); }
  finally { db.close(); }
  const login = await call(f.base, '/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
  assert.equal(login.status, 200);
  const result = await json<{ csrfToken: string }>(login);
  return { cookie: login.headers.get('set-cookie')!.split(';', 1)[0], csrf: result.csrfToken, username };
}

test('project storage prepares six folders, queues one manual upload, reports verified progress, and restores a missing clip cache', async t => {
  let entered!: () => void; const started = new Promise<void>(resolveEntered => { entered = resolveEntered; });
  const state: FakeDriveState = { uploads: 0, folderCalls: 0, downloads: 0, failNext: 0, hold: true, entered, files: new Map() };
  const f = await fixture(t, fakeDrive(state)); const owner = await createOwner(f.base); const project = await expandProject(f, owner);
  const { clip, path, bytes } = await addSyntheticClip(f, owner, project);
  const otherProject = await createProject(f.base, owner);

  assert.equal(state.uploads, 0, 'project creation and startup must never auto-upload media');
  assert.equal((await call(f.base, '/projects/not-a-uuid/storage', owner)).status, 400);
  assert.equal((await call(f.base, `/projects/${project.id}/storage`)).status, 401);
  const initial = await json<{ storage: { prepared: boolean; transfers: unknown[]; summary: { total: number } } }>(await call(f.base, `/projects/${project.id}/storage`, owner));
  assert.equal(initial.storage.prepared, false); assert.equal(initial.storage.summary.total, 0); assert.deepEqual(initial.storage.transfers, []);

  const noCsrf = await call(f.base, `/projects/${project.id}/storage/prepare`, { ...owner, csrf: '' }, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403);
  const forbiddenInput = await call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: clip.id, ownerId: 'foreign' }) });
  assert.equal(forbiddenInput.status, 400);
  const forbiddenPath = await call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: clip.id, filePath: '../../private.mp4' }) });
  assert.equal(forbiddenPath.status, 400);
  const beforePrepared = await call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: clip.id }) });
  assert.equal(beforePrepared.status, 409);

  const foreignMedia = await call(f.base, `/projects/${otherProject.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: clip.id }) });
  assert.equal(foreignMedia.status, 404, 'media must belong to the project in the route');
  const prepare = await call(f.base, `/projects/${project.id}/storage/prepare`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(prepare.status, 200);
  const prepared = (await json<{ storage: { prepared: boolean; folders: DriveProjectFolders } }>(prepare)).storage;
  assert.equal(prepared.prepared, true); assert.equal(state.folderCalls, 1);
  assert.deepEqual(Object.keys(prepared.folders.categories).sort(), ['archives', 'investment', 'kidsToy', 'productReview', 'sharedAssets', 'story'].sort());
  assert.equal(state.uploads, 0, 'folder preparation must not upload media');

  const body = JSON.stringify({ kind: 'clips', mediaId: clip.id });
  const firstPromise = call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  await started;
  const first = await firstPromise;
  assert.equal(first.status, 202);
  const firstTransfer = (await json<{ transfer: { id: string; status: string } }>(first)).transfer;
  const duplicate = await call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(duplicate.status, 202);
  assert.equal((await json<{ transfer: { id: string } }>(duplicate)).transfer.id, firstTransfer.id);
  const running = await json<{ storage: { transfers: { id: string; status: string; progress: number; bytes: number; totalBytes: number }[] } }>(await call(f.base, `/projects/${project.id}/storage`, owner));
  const live = running.storage.transfers.find(item => item.id === firstTransfer.id)!;
  assert.equal(live.status, 'running'); assert.ok(live.progress > 0); assert.ok(live.bytes > 0); assert.equal(live.totalBytes, bytes.byteLength);
  assert.equal(state.uploads, 1); assert.equal(state.lastUpload?.idempotencyKey, `clips:${clip.id}`);
  state.hold = false; state.release?.();
  await f.app.projectStorage?.wait();

  const completed = await json<{ storage: { summary: { completed: number }; transfers: { id: string; status: string; progress: number; file?: { verified?: boolean; md5Checksum?: string; size: number } }[] } }>(await call(f.base, `/projects/${project.id}/storage`, owner));
  const done = completed.storage.transfers.find(item => item.id === firstTransfer.id)!;
  assert.equal(done.status, 'completed', `${JSON.stringify(completed.storage.transfers)} drive=${state.lastError ?? 'ok'}`); assert.equal(done.progress, 100); assert.equal(completed.storage.summary.completed, 1);
  assert.equal(done.file?.verified, true); assert.equal(done.file?.md5Checksum, createHash('md5').update(bytes).digest('hex')); assert.equal(done.file?.size, bytes.length);
  assert.equal(state.uploads, 1, 'duplicate request must not produce a second remote upload');

  await unlink(path);
  const restored = await call(f.base, `/clips/${clip.id}/file`, owner);
  assert.equal(restored.status, 200); assert.deepEqual(Buffer.from(await restored.arrayBuffer()), bytes); assert.equal(state.downloads, 1);
  assert.deepEqual(await readFile(path), bytes, 'protected file read restores the managed cache from the owner catalog');

  const other = await createSecondOwner(f);
  assert.equal((await call(f.base, `/projects/${project.id}/storage`, other)).status, 404);
  const otherUpload = await call(f.base, `/projects/${project.id}/storage/uploads`, other, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.equal(otherUpload.status, 404); assert.equal(state.uploads, 1);
});

test('a failed Drive transfer retries only after an explicit upload request', async t => {
  const state: FakeDriveState = { uploads: 0, folderCalls: 0, downloads: 0, failNext: 1, hold: false, files: new Map() };
  const f = await fixture(t, fakeDrive(state)); const owner = await createOwner(f.base); const project = await expandProject(f, owner);
  const { clip } = await addSyntheticClip(f, owner, project);
  await call(f.base, `/projects/${project.id}/storage/prepare`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const path = `/projects/${project.id}/storage/uploads`;
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: clip.id }) };
  const first = await call(f.base, path, owner, init); assert.equal(first.status, 202);
  const firstId = (await json<{ transfer: { id: string } }>(first)).transfer.id;
  await f.app.projectStorage?.wait();
  const failed = await json<{ storage: { transfers: { id: string; status: string; errorCode: string | null }[] } }>(await call(f.base, `/projects/${project.id}/storage`, owner));
  const error = failed.storage.transfers.find(item => item.id === firstId)!;
  assert.equal(error.status, 'failed'); assert.equal(error.errorCode, 'DRIVE_REQUEST_FAILED'); assert.equal(state.uploads, 1);

  const retry = await call(f.base, path, owner, init); assert.equal(retry.status, 202);
  assert.equal((await json<{ transfer: { id: string } }>(retry)).transfer.id, firstId);
  await f.app.projectStorage?.wait();
  const recovered = await json<{ storage: { transfers: { id: string; status: string }[] } }>(await call(f.base, `/projects/${project.id}/storage`, owner));
  assert.equal(recovered.storage.transfers.find(item => item.id === firstId)?.status, 'completed', `${JSON.stringify(recovered.storage.transfers)} drive=${state.lastError ?? 'ok'}`);
  assert.equal(state.uploads, 2);
});

test('storage routes report a useful error when OAuth/Drive is not configured', async t => {
  const f = await fixture(t); const owner = await createOwner(f.base); const project = await createProject(f.base, owner);
  const prepare = await call(f.base, `/projects/${project.id}/storage/prepare`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(prepare.status, 409);
  assert.equal((await json<{ error: { code: string } }>(prepare)).error.code, 'DRIVE_NOT_CONFIGURED');
  const upload = await call(f.base, `/projects/${project.id}/storage/uploads`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: randomUUID() }) });
  assert.equal(upload.status, 404, 'the media catalog is checked before unavailable Drive configuration');
});
