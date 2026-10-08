import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { DriveError, type DriveIntegration, type DriveUpload, type OAuthCallback, type SessionValidator } from '../server/storage/types.js';
import { MemoryCloudRepository } from '../server/cloud/memory.js';
import type { AiProvider } from '../server/ai/types.js';
import type { Idea, ProjectInput, StoryPackage } from '../shared/contracts.js';
import type { CloudRepository, CloudProjectSnapshot } from '../shared/integrations.js';

const origin = 'http://127.0.0.1:5173';
const input: ProjectInput = { name: 'Integration QA', brief: 'A traveler finds a lost umbrella in a storm.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
const ideas: Idea[] = Array.from({ length: 10 }, (_, i) => ({ id: `idea_${i + 1}`, title: { th: `เรื่อง ${i + 1}`, en: `Story ${i + 1}` }, logline: { th: `เรื่องย่อ ${i + 1}`, en: `Logline ${i + 1}` }, hook: { th: `จุดเด่น ${i + 1}`, en: `Hook ${i + 1}` } }));
const story: StoryPackage = {
  storyBible: { th: 'เรื่องตัวอย่าง', en: 'Sample story' },
  characters: [{ id: 'char_1', name: 'Mali', visualDescriptionEn: 'Blue jacket', background: { th: 'พื้นหลัง', en: 'Background' } }],
  locations: [{ id: 'loc_1', name: { th: 'สวน', en: 'Garden' }, visualDescriptionEn: 'Quiet garden', description: { th: 'สถานที่', en: 'Place' } }],
  continuityRules: [{ th: 'เสื้อสีน้ำเงิน', en: 'Blue jacket' }],
  scenes: [1, 2, 3].map(order => ({ id: `scene_${order}`, order, title: { th: `ฉาก ${order}`, en: `Scene ${order}` }, durationSeconds: 8, explanationTh: `คำอธิบาย ${order}`, flowPromptEn: `A garden, shot ${order}`, narration: { th: 'เสียงบรรยาย', en: 'Narration' }, characterIds: ['char_1'], locationId: 'loc_1' })),
};
const ai: AiProvider = { async generateIdeas() { return structuredClone(ideas); }, async expandStory() { return structuredClone(story); } };

interface Session { cookie: string; csrf: string; username: string }
interface Fixture { base: string; server: Server; app: Awaited<ReturnType<typeof createApplication>>; dataDir: string }
async function fixture(t: TestContext, integrations: { aiStatus?: () => { mode: 'mock'; active: 'mock'; fallbackReason: null }; drive?: DriveIntegration; cloudRepository?: CloudRepository } = {}, aiProvider = ai, startCloudWorker = false): Promise<Fixture> {
  const root = resolve('.tmp'); await mkdir(root, { recursive: true });
  const dataDir = await mkdtemp(join(root, 'integration-api-'));
  const app = await createApplication({ dataDir, provider: aiProvider, allowedOrigins: [origin], startWorker: false, integrations, startCloudWorker });
  const server = createServer(app.app);
  await new Promise<void>((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { await new Promise<void>(resolveClose => server.close(() => resolveClose())); await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { base: `http://127.0.0.1:${address.port}/api`, server, app, dataDir };
}
async function call(base: string, path: string, session?: Session, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (session) headers.set('Cookie', session.cookie);
  if (init.method && init.method !== 'GET') headers.set('Origin', origin);
  if (session && init.method && init.method !== 'GET') headers.set('X-CSRF-Token', session.csrf);
  return fetch(`${base}${path}`, { ...init, headers });
}
async function owner(base: string): Promise<Session> {
  const response = await call(base, '/auth/setup', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'int_owner', password: 'qa-integration-pass-2026' }) });
  assert.equal(response.status, 201);
  const body = await response.json() as { csrfToken: string; user: { username: string } };
  return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0], csrf: body.csrfToken, username: body.user.username };
}
async function json<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }

test('integrations APIs require owner session, CSRF, strict owner-bound input, and expose safe unavailable status', async t => {
  const f = await fixture(t, { aiStatus: () => ({ mode: 'mock', active: 'mock', fallbackReason: null }) }); const noSession = await call(f.base, '/integrations/capabilities');
  assert.equal(noSession.status, 401);
  const session = await owner(f.base);
  const capabilities = await json<{ capabilities: { storage: { state: string }; structuredData: { configured: boolean } } }>(await call(f.base, '/integrations/capabilities', session));
  assert.equal(capabilities.capabilities.storage.state, 'not_configured');
  assert.equal(capabilities.capabilities.structuredData.configured, false);
  const capabilityResponse = await call(f.base, '/integrations/capabilities', session);
  assert.equal(capabilityResponse.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await capabilityResponse.text(), /sk-[A-Za-z0-9_-]{12,}|clientSecret|refreshToken/i);
  const noCsrf = await fetch(`${f.base}/cloud/projects`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(noCsrf.status, 403);
  const foreignOrigin = await fetch(`${f.base}/cloud/projects`, { method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(foreignOrigin.status, 403);
  const unavailable = await call(f.base, '/integrations/drive/authorize', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(unavailable.status, 409);
  assert.doesNotMatch(await unavailable.text(), /token|secret|key/i);
});

test('cloud project owner is server-derived, extra ownerId rejected, and revision protects selection', async t => {
  const repo = new MemoryCloudRepository(); const f = await fixture(t, { cloudRepository: repo }); const session = await owner(f.base);
  const foreign = await call(f.base, '/cloud/projects', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, ownerId: randomUUID() }) });
  assert.equal(foreign.status, 400);
  assert.equal((await repo.projects(f.app.store.credentials(session.username)!.user.id)).length, 0);
  const created = await call(f.base, '/cloud/projects', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(created.status, 201);
  const project = (await json<{ project: CloudProjectSnapshot }>(created)).project;
  assert.equal(project.ownerId, f.app.store.credentials(session.username)!.user.id);
  const unauthorized = await call(f.base, `/cloud/projects/${project.id}`);
  assert.equal(unauthorized.status, 401);
  const earlySelect = await call(f.base, `/cloud/projects/${project.id}/select`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: ideas[0].id, revision: project.revision }) });
  assert.equal(earlySelect.status, 409);
  assert.equal((await json<{ error: { code: string } }>(earlySelect)).error.code, 'IDEAS_REQUIRED');
  const mutated = await call(f.base, `/cloud/projects/${project.id}/select`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: ideas[0].id, revision: project.revision, ownerId: randomUUID() }) });
  assert.equal(mutated.status, 400);
});

test('cloud Story Factory generates ten ideas, expands only the selected one, and gates local export', async t => {
  let receivedExpansion: { brief: ProjectInput; selected: Idea } | undefined;
  const selectedOnlyAi: AiProvider = { ...ai, async expandStory(brief, selected) { receivedExpansion = { brief, selected }; return structuredClone(story); } };
  const repo = new MemoryCloudRepository();
  const f = await fixture(t, { cloudRepository: repo }, selectedOnlyAi);
  const app = f.app;
  const session = await owner(f.base);
  const create = await call(f.base, '/cloud/projects', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(create.status, 201);
  const project = (await json<{ project: CloudProjectSnapshot }>(create)).project;
  const earlyExpand = await call(f.base, `/cloud/projects/${project.id}/expand`, session, { method: 'POST' });
  assert.equal(earlyExpand.status, 409);
  assert.equal((await json<{ error: { code: string } }>(earlyExpand)).error.code, 'SELECTION_REQUIRED');
  const enqueueIdeas = await call(f.base, `/cloud/projects/${project.id}/ideas`, session, { method: 'POST' });
  assert.equal(enqueueIdeas.status, 202);
  const ideaJob = (await json<{ job: { id: string } }>(enqueueIdeas)).job;
  assert.equal(await (app.cloudWorker?.runNext() ?? Promise.resolve(false)), true);
  const list = await call(f.base, `/cloud/projects/${project.id}`, session);
  const withIdeas = (await json<{ project: CloudProjectSnapshot }>(list)).project;
  assert.equal(withIdeas.ideas.length, 10);
  const chosen = withIdeas.ideas[6];
  const selected = await call(f.base, `/cloud/projects/${project.id}/select`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: chosen.id, revision: withIdeas.revision }) });
  assert.equal(selected.status, 200);
  const selectedProject = (await json<{ project: CloudProjectSnapshot }>(selected)).project;
  const stale = await call(f.base, `/cloud/projects/${project.id}/select`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: withIdeas.ideas[0].id, revision: withIdeas.revision }) });
  assert.equal(stale.status, 409);
  const expand = await call(f.base, `/cloud/projects/${project.id}/expand`, session, { method: 'POST' });
  assert.equal(expand.status, 202);
  const expandJob = (await json<{ job: { id: string } }>(expand)).job;
  assert.equal(await (app.cloudWorker?.runNext() ?? Promise.resolve(false)), true);
  const detail = (await json<{ project: CloudProjectSnapshot }>(await call(f.base, `/cloud/projects/${project.id}`, session))).project;
  assert.equal(detail.selectedIdeaId, chosen.id);
  assert.ok(detail.package);
  assert.deepEqual(receivedExpansion, { brief: input, selected: chosen });
  const forbiddenExport = await call(f.base, `/cloud/projects/${project.id}/export`, session, { method: 'POST' });
  assert.equal(forbiddenExport.status, 409);
  assert.equal((await json<{ error: { code: string } }>(forbiddenExport)).error.code, 'CLIPS_REQUIRED');
  const listedJobs = await call(f.base, `/cloud/projects/${project.id}/jobs`, session);
  const jobs = (await json<{ jobs: { id: string; status: string }[] }>(listedJobs)).jobs;
  assert.equal(jobs.find(job => job.id === ideaJob.id)?.status, 'completed');
  assert.equal(jobs.find(job => job.id === expandJob.id)?.status, 'completed');
  void selectedProject;
});

test('Drive OAuth callback is cookie-free but requires the original live owner session', async t => {
  let savedOwner = ''; let savedSessionHash = ''; let callbackCount = 0;
  const drive: DriveIntegration = {
    async status() { return { provider: 'google_drive', configured: true, connected: false, state: 'disconnected' }; },
    async begin(ownerId, sessionHash) { savedOwner = ownerId; savedSessionHash = sessionHash; return { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=local-test-state' }; },
    async callback(_input: OAuthCallback, valid: SessionValidator) { callbackCount++; if (!await valid(savedOwner, savedSessionHash)) throw new DriveError('DRIVE_STATE_INVALID'); },
    async upload() { throw new Error('unused'); }, async download() { throw new Error('unused'); },
  };
  const f = await fixture(t, { drive }); const session = await owner(f.base);
  const auth = await call(f.base, '/integrations/drive/authorize', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(auth.status, 200);
  const token = session.cookie.slice(session.cookie.indexOf('=') + 1);
  assert.equal(savedSessionHash, createHash('sha256').update(token).digest('hex'));
  const callback = await call(f.base, '/integrations/drive/callback?state=abcdefghijklmnopqrstuvwxyz123456&code=mock', undefined, { redirect: 'manual' });
  assert.equal(callback.status, 303);
  assert.equal(callbackCount, 1);
  const authAgain = await call(f.base, '/integrations/drive/authorize', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(authAgain.status, 200);
  const logout = await call(f.base, '/auth/logout', session, { method: 'POST' });
  assert.equal(logout.status, 200);
  const afterLogout = await call(f.base, '/integrations/drive/callback?state=abcdefghijklmnopqrstuvwxyz123456&code=mock');
  assert.equal(afterLogout.status, 400);
  assert.equal(callbackCount, 2);
});

test('Drive backup resolves only owner media, uses private file bytes, and serializes concurrent transfers', async t => {
  let started!: () => void; let release!: () => void;
  const entered = new Promise<void>(resolveStarted => { started = resolveStarted; });
  const hold = new Promise<void>(resolveRelease => { release = resolveRelease; });
  let active = 0; let maxActive = 0; let received: { filePath: string; name: string; bytes: string } | undefined;
  const drive: DriveIntegration = {
    async status() { return { provider: 'google_drive', configured: true, connected: true, state: 'connected' }; },
    async begin() { return { authorizationUrl: 'https://example.invalid' }; }, async callback() {}, async download() { return new Uint8Array(); },
    async upload(_ownerId, upload: DriveUpload) {
      assert.ok(upload.filePath); active++; maxActive = Math.max(maxActive, active); started(); await hold;
      received = { filePath: upload.filePath!, name: upload.name, bytes: await readFile(upload.filePath!, 'utf8') }; active--;
      return { id: 'drive-file-1', name: upload.name, mimeType: upload.mimeType, size: Buffer.byteLength(received.bytes) };
    },
  };
  const f = await fixture(t, { drive }); const session = await owner(f.base);
  const project = f.app.store.createProject(sessionUserId(f, session), input);
  const ideaJob = f.app.store.enqueue(sessionUserId(f, session), project.id, 'ideas');
  f.app.store.completeIdeas(ideaJob, ideas);
  f.app.store.select(sessionUserId(f, session), project.id, ideas[0].id);
  const expandJob = f.app.store.enqueue(sessionUserId(f, session), project.id, 'expand');
  f.app.store.completePackage(expandJob, story);
  const clipFile = `${randomUUID()}.mp4`; const clipsDir = join(f.dataDir, 'clips'); await mkdir(clipsDir, { recursive: true });
  await writeFile(join(clipsDir, clipFile), 'private clip payload');
  const clip = f.app.store.addClip(sessionUserId(f, session), project.id, story.scenes[0].id, clipFile, 'private.mp4', 8);
  const outsiderId = randomUUID();
  const outsider = await call(f.base, `/integrations/drive/backups`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: randomUUID(), ownerId: outsiderId }) });
  assert.equal(outsider.status, 400);
  const missing = await call(f.base, `/integrations/drive/backups`, session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: randomUUID() }) });
  assert.equal(missing.status, 404);
  const reqBody = JSON.stringify({ kind: 'clips', mediaId: clip.id });
  const first = call(f.base, '/integrations/drive/backups', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody });
  await entered;
  const second = await call(f.base, '/integrations/drive/backups', session, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: reqBody });
  assert.equal(second.status, 409);
  release();
  const firstResponse = await first; assert.equal(firstResponse.status, 201);
  assert.equal(maxActive, 1);
  assert.equal(received?.name, `clips-${clip.id}.mp4`);
  assert.equal(received?.bytes, 'private clip payload');
  assert.ok(received?.filePath.startsWith(clipsDir));
});

test('second owner cannot read cloud projects/jobs or back up another owner media', async t => {
  let driveUploads = 0;
  let providerCalls = 0;
  const drive: DriveIntegration = {
    async status() { return { provider: 'google_drive', configured: true, connected: true, state: 'connected' }; },
    async begin() { return { authorizationUrl: 'https://example.invalid' }; }, async callback() {}, async download() { return new Uint8Array(); },
    async upload(_ownerId, upload) { driveUploads++; return { id: 'unexpected', name: upload.name, mimeType: upload.mimeType, size: 1 }; },
  };
  const repo = new MemoryCloudRepository();
  const f = await fixture(t, { drive, cloudRepository: repo }, {
    async generateIdeas() { providerCalls++; return structuredClone(ideas); },
    async expandStory() { providerCalls++; return structuredClone(story); },
  });
  const first = await owner(f.base);
  const firstOwnerId = sessionUserId(f, first);
  const cloudCreate = await call(f.base, '/cloud/projects', first, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  assert.equal(cloudCreate.status, 201);
  const cloudProject = (await json<{ project: CloudProjectSnapshot }>(cloudCreate)).project;
  const cloudQueued = await call(f.base, `/cloud/projects/${cloudProject.id}/ideas`, first, { method: 'POST' });
  assert.equal(cloudQueued.status, 202);
  const cloudJob = (await json<{ job: { id: string } }>(cloudQueued)).job;

  const localProject = f.app.store.createProject(firstOwnerId, input);
  const ideaJob = f.app.store.enqueue(firstOwnerId, localProject.id, 'ideas');
  f.app.store.completeIdeas(ideaJob, ideas);
  f.app.store.select(firstOwnerId, localProject.id, ideas[0].id);
  const expandJob = f.app.store.enqueue(firstOwnerId, localProject.id, 'expand');
  f.app.store.completePackage(expandJob, story);
  const media = f.app.store.addClip(firstOwnerId, localProject.id, story.scenes[0].id, `${randomUUID()}.mp4`, 'owner-private.mp4', 8);

  const otherPassword = 'another-test-password-2026';
  const db = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  try {
    db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .run(randomUUID(), 'synthetic_other', await hashPassword(otherPassword), new Date().toISOString());
  } finally { db.close(); }
  const login = await call(f.base, '/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic_other', password: otherPassword }) });
  assert.equal(login.status, 200);
  const loginBody = await json<{ user: { id: string }; csrfToken: string }>(login);
  const other: Session = { cookie: login.headers.get('set-cookie')!.split(';', 1)[0], csrf: loginBody.csrfToken, username: 'synthetic_other' };
  assert.notEqual(loginBody.user.id, firstOwnerId);

  const ownerList = await json<{ projects: CloudProjectSnapshot[] }>(await call(f.base, '/cloud/projects', first));
  assert.equal(ownerList.projects.length, 1);
  assert.equal(ownerList.projects[0].id, cloudProject.id);
  const otherList = await json<{ projects: CloudProjectSnapshot[] }>(await call(f.base, '/cloud/projects', other));
  assert.deepEqual(otherList.projects, []);
  const hiddenProject = await call(f.base, `/cloud/projects/${cloudProject.id}`, other);
  assert.equal(hiddenProject.status, 404);
  const hiddenJobs = await call(f.base, `/cloud/projects/${cloudProject.id}/jobs`, other);
  assert.equal(hiddenJobs.status, 404);
  const ownerJobs = await json<{ jobs: { id: string }[] }>(await call(f.base, `/cloud/projects/${cloudProject.id}/jobs`, first));
  assert.deepEqual(ownerJobs.jobs.map(job => job.id), [cloudJob.id]);

  const hiddenBackup = await call(f.base, '/integrations/drive/backups', other, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'clips', mediaId: media.id }) });
  assert.equal(hiddenBackup.status, 404);
  assert.equal(driveUploads, 0, 'an owner mismatch must be rejected before Drive receives a file');
  assert.equal(providerCalls, 0, 'queued cloud work must not invoke a provider during access checks');
});

function sessionUserId(f: Fixture, session: Session) { return f.app.store.credentials(session.username)!.user.id; }
