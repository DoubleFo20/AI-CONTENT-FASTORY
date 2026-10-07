import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import type { AiProvider } from '../server/ai/types.js';
import type { Idea, ProjectInput, StoryPackage } from '../shared/contracts.js';

const origin = 'http://127.0.0.1:5173';
const execFileAsync = promisify(execFile);
const projectInput: ProjectInput = {
  name: 'QA story', brief: 'A traveler finds a lost umbrella during a storm.',
  genre: 'Drama', audience: 'General audience', aspectRatio: '9:16',
};
const localized = (value: string) => ({ th: `ไทย ${value}`, en: `English ${value}` });
const ideas: Idea[] = Array.from({ length: 10 }, (_, index) => ({
  id: `idea_${index + 1}`, title: localized(`title ${index + 1}`),
  logline: localized(`logline ${index + 1}`), hook: localized(`hook ${index + 1}`),
}));
const story: StoryPackage = {
  storyBible: localized('story'),
  characters: [{ id: 'character_1', name: 'Mali', visualDescriptionEn: 'Blue jacket', background: localized('background') }],
  locations: [{ id: 'location_1', name: localized('garden'), visualDescriptionEn: 'Quiet garden', description: localized('place') }],
  continuityRules: [localized('jacket remains blue')],
  scenes: [1, 2, 3].map((order) => ({
    id: `scene_${order}`, order, title: localized(`scene ${order}`), durationSeconds: 20,
    explanationTh: `คำอธิบาย ${order}`, flowPromptEn: `Mali in the garden, shot ${order}`,
    narration: localized(`narration ${order}`), characterIds: ['character_1'], locationId: 'location_1',
  })),
};

function provider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    generateIdeas: async () => structuredClone(ideas),
    expandStory: async () => {
      return structuredClone(story);
    },
    ...overrides,
  };
}

interface Fixture {
  baseUrl: string;
  server: Server;
  app: Awaited<ReturnType<typeof createApplication>>;
  dataDir: string;
}

async function fixture(t: TestContext, aiProvider = provider()): Promise<Fixture> {
  const root = resolve('.tmp');
  await mkdir(root, { recursive: true });
  const dataDir = await mkdtemp(join(root, 'api-test-'));
  const app = await createApplication({ dataDir, provider: aiProvider, allowedOrigins: [origin], startWorker: false });
  const server = createServer(app.app);
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  t.after(async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { baseUrl, server, app, dataDir };
}

interface Session { cookie: string; csrf: string; username: string; password: string }

async function request(baseUrl: string, path: string, options: RequestInit = {}, session?: Session): Promise<Response> {
  const headers = new Headers(options.headers);
  if (session) headers.set('Cookie', session.cookie);
  if (options.method && options.method !== 'GET' && options.method !== 'HEAD') headers.set('Origin', origin);
  if (session && options.method && options.method !== 'GET' && options.method !== 'HEAD') headers.set('X-CSRF-Token', session.csrf);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function json<T>(response: Response): Promise<T> { return response.json() as Promise<T>; }

async function createOwner(baseUrl: string): Promise<Session> {
  const username = 'qa_owner';
  const password = 'qa-test-password-2026';
  const response = await request(baseUrl, '/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 201);
  const state = await json<{ user: { username: string }; csrfToken: string }>(response);
  assert.equal(state.user.username, username);
  assert.ok(state.csrfToken);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie, 'setup must issue an authenticated session cookie');
  return { cookie, csrf: state.csrfToken, username, password };
}

async function data<T>(response: Response): Promise<T> {
  const body = await json<T>(response);
  assert.equal(response.status >= 400, false, JSON.stringify(body));
  return body;
}

test('API enforces setup/session, origin and CSRF, validates projects, and runs selected-only pipeline', async (t) => {
  let receivedExpansion: { input: ProjectInput; selected: Idea } | null = null;
  const f = await fixture(t, provider({ expandStory: async (input, selected) => {
    receivedExpansion = { input, selected };
    return structuredClone(story);
  } }));
  const unauthenticated = await request(f.baseUrl, '/projects');
  assert.equal(unauthenticated.status, 401);

  const first = await createOwner(f.baseUrl);
  const status = await data<{ user: { username: string }; csrfToken: string; setupRequired: boolean }>(await request(f.baseUrl, '/auth/status', {}, first));
  assert.equal(status.user.username, first.username);
  assert.equal(status.setupRequired, false);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const login = await request(f.baseUrl, '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: attempt === 0 ? first.username.toUpperCase() : first.username, password: first.password }),
    });
    assert.equal(login.status, 200, 'successful auth must reset the failed-attempt throttle');
  }

  const secondSetup = await request(f.baseUrl, '/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'second', password: first.password }),
  });
  assert.equal(secondSetup.status, 409);

  const badLogin = await request(f.baseUrl, '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: first.username, password: 'wrong-password-2026' }),
  });
  assert.equal(badLogin.status, 401);

  const missingCsrf = await fetch(`${f.baseUrl}/projects`, {
    method: 'POST', headers: { Origin: origin, Cookie: first.cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify(projectInput),
  });
  assert.equal(missingCsrf.status, 403);
  const wrongOrigin = await fetch(`${f.baseUrl}/projects`, {
    method: 'POST', headers: { Origin: 'https://attacker.invalid', Cookie: first.cookie, 'X-CSRF-Token': first.csrf, 'Content-Type': 'application/json' },
    body: JSON.stringify(projectInput),
  });
  assert.equal(wrongOrigin.status, 403);

  const invalidProject = await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...projectInput, name: '' }),
  }, first);
  assert.equal(invalidProject.status, 400);

  const created = await data<{ project: { id: string; status: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput),
  }, first));
  const projectId = created.project.id;
  assert.equal(created.project.status, 'draft');

  const expandWithoutSelection = await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, first);
  assert.equal(expandWithoutSelection.status, 409);
  const selectionBeforeIdeas = await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'missing' }),
  }, first);
  assert.equal(selectionBeforeIdeas.status, 409);

  const queuedIdeas = await data<{ job: { id: string; status: string } }>(await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, first));
  assert.equal(queuedIdeas.job.status, 'queued');
  const duplicate = await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, first);
  assert.equal(duplicate.status, 409);
  assert.equal(await f.app.worker.runNext(), true);

  const invalidSelection = await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'missing' }),
  }, first);
  assert.equal(invalidSelection.status, 400);

  const selected = await data<{ project: { selectedIdeaId: string; status: string } }>(await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'idea_1' }),
  }, first));
  assert.equal(selected.project.selectedIdeaId, 'idea_1');
  const queuedExpansion = await data<{ job: { status: string } }>(await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, first));
  assert.equal(queuedExpansion.job.status, 'queued');
  assert.equal(await f.app.worker.runNext(), true);
  const expansionJobs = await data<{ jobs: Array<{ status: string; errorCode: string | null }> }>(await request(f.baseUrl, '/jobs', {}, first));
  assert.equal(expansionJobs.jobs[0]?.status, 'completed', JSON.stringify(expansionJobs.jobs[0]));

  const expanded = await data<{ project: { status: string; package: StoryPackage; ideas: Idea[] } }>(await request(f.baseUrl, `/projects/${projectId}`, {}, first));
  assert.equal(expanded.project.status, 'expanded');
  assert.equal(expanded.project.ideas.length, 10);
  assert.equal(expanded.project.package.scenes.length, 3);
  assert.deepEqual(Object.keys(receivedExpansion!.input).sort(), ['aspectRatio', 'audience', 'brief', 'genre', 'name']);
  assert.equal(receivedExpansion!.selected.id, 'idea_1');

  const loggedOut = await request(f.baseUrl, '/auth/logout', { method: 'POST' }, first);
  assert.equal(loggedOut.status, 200);
  assert.equal((await request(f.baseUrl, '/projects', {}, first)).status, 401);
});

test('auth throttle limits repeated failures but does not accumulate successful logins', async (t) => {
  const f = await fixture(t);
  const session = await createOwner(f.baseUrl);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const failure = await request(f.baseUrl, '/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: session.username, password: 'incorrect-password-2026' }),
    });
    assert.equal(failure.status, 401);
  }
  const limited = await request(f.baseUrl, '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: session.username, password: session.password }),
  });
  assert.equal(limited.status, 429);
});

test('project, job, and media records are invisible across owners', async (t) => {
  const f = await fixture(t);
  const owner = await createOwner(f.baseUrl);
  const project = await data<{ project: { id: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput),
  }, owner));
  const queued = await data<{ job: { id: string } }>(await request(f.baseUrl, `/projects/${project.project.id}/ideas`, { method: 'POST' }, owner));
  const mediaId = randomUUID();
  const db = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  try {
    const userId = randomUUID();
    db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)')
      .run(userId, 'other_owner', await hashPassword('another-test-password-2026'), new Date().toISOString());
    db.prepare('INSERT INTO clips(id,project_id,scene_id,internal_filename,original_name,duration_seconds,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(mediaId, project.project.id, 'scene_1', `${randomUUID()}.mp4`, 'hidden.mp4', 4, new Date().toISOString());
  } finally { db.close(); }
  const otherLogin = await request(f.baseUrl, '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'OTHER_OWNER', password: 'another-test-password-2026' }),
  });
  assert.equal(otherLogin.status, 200, 'username normalization is case-insensitive');
  const otherState = await json<{ csrfToken: string }>(otherLogin);
  const otherCookie = otherLogin.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(otherCookie);
  const other: Session = { cookie: otherCookie, csrf: otherState.csrfToken, username: 'other_owner', password: 'another-test-password-2026' };
  assert.equal((await request(f.baseUrl, `/projects/${project.project.id}`, {}, other)).status, 404);
  const visibleJobs = await data<{ jobs: Array<{ id: string }> }>(await request(f.baseUrl, '/jobs', {}, other));
  assert.equal(visibleJobs.jobs.some((job) => job.id === queued.job.id), false);
  assert.equal((await request(f.baseUrl, `/jobs/${queued.job.id}/retry`, { method: 'POST' }, other)).status, 404);
  assert.equal((await request(f.baseUrl, `/clips/${mediaId}/file`, {}, other)).status, 404);
});

test('clip import rejects invalid media and scene references, then exports an authenticated MP4', async (t) => {
  const shortStory = structuredClone(story);
  shortStory.scenes.forEach((scene) => { scene.durationSeconds = 4; });
  const f = await fixture(t, provider({ expandStory: async () => structuredClone(shortStory) }));
  const session = await createOwner(f.baseUrl);
  const project = await data<{ project: { id: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput),
  }, session));
  const projectId = project.project.id;
  await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, session);
  await f.app.worker.runNext();
  await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'idea_1' }),
  }, session);
  await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, session);
  await f.app.worker.runNext();

  const invalidForm = new FormData();
  invalidForm.append('sceneId', 'scene_1');
  invalidForm.append('clip', new Blob(['not a video'], { type: 'video/mp4' }), 'bad.mp4');
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/clips`, { method: 'POST', body: invalidForm }, session)).status, 400);

  const oversized = new FormData();
  oversized.append('sceneId', 'scene_1');
  oversized.append('clip', new Blob([new Uint8Array(128 * 1024 * 1024 + 1)], { type: 'video/mp4' }), 'large.mp4');
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/clips`, { method: 'POST', body: oversized }, session)).status, 413);

  const videoPath = join(f.dataDir, 'synthetic.mp4');
  await execFileAsync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64:r=30', '-t', '4', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', videoPath]);
  const video = await readFile(videoPath);
  for (const scene of shortStory.scenes) {
    const form = new FormData();
    form.append('sceneId', scene.id);
    form.append('clip', new Blob([video], { type: 'video/mp4' }), `${scene.id}.mp4`);
    const uploaded = await request(f.baseUrl, `/projects/${projectId}/clips`, { method: 'POST', body: form }, session);
    assert.equal(uploaded.status, 201, await uploaded.text());
  }
  const wrongScene = new FormData();
  wrongScene.append('sceneId', 'not_a_scene');
  wrongScene.append('clip', new Blob([video], { type: 'video/mp4' }), 'wrong-scene.mp4');
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/clips`, { method: 'POST', body: wrongScene }, session)).status, 400);

  const exportQueued = await data<{ job: { id: string } }>(await request(f.baseUrl, `/projects/${projectId}/export`, { method: 'POST' }, session));
  assert.ok(exportQueued.job.id);
  assert.equal(await f.app.worker.runNext(), true);
  const exported = await data<{ project: { status: string; export: { id: string } | null } }>(await request(f.baseUrl, `/projects/${projectId}`, {}, session));
  assert.equal(exported.project.status, 'exported');
  assert.ok(exported.project.export);
  const file = await request(f.baseUrl, `/exports/${exported.project.export!.id}/file`, {}, session);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') ?? '', /video\/mp4/);
  assert.equal(file.headers.get('cache-control'), 'no-store');
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(4, 8)), 'ftyp');
});

test('failed provider job preserves valid prior content and retry requires valid prerequisites', async (t) => {
  let failExpansion = true;
  const f = await fixture(t, provider({ expandStory: async () => {
    if (failExpansion) throw new Error('private provider detail');
    return structuredClone(story);
  } }));
  const session = await createOwner(f.baseUrl);
  const project = await data<{ project: { id: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput),
  }, session));
  const projectId = project.project.id;
  await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, session);
  await f.app.worker.runNext();
  await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'idea_1' }),
  }, session);
  const failedJob = await data<{ job: { id: string } }>(await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, session));
  await f.app.worker.runNext();
  const jobResponse = await data<{ jobs: Array<{ id: string; status: string; errorCode: string | null }> }>(await request(f.baseUrl, '/jobs', {}, session));
  const failed = jobResponse.jobs.find((job) => job.id === failedJob.job.id);
  assert.equal(failed?.status, 'failed');
  assert.ok(failed?.errorCode);
  assert.doesNotMatch(JSON.stringify(failed), /private provider detail/);

  const retriedBeforeFix = await data<{ job: { id: string; status: string } }>(await request(f.baseUrl, `/jobs/${failedJob.job.id}/retry`, { method: 'POST' }, session));
  assert.equal(retriedBeforeFix.job.status, 'queued');
  await f.app.worker.runNext();
  const stillNoPackage = await data<{ project: { package: StoryPackage | null; ideas: Idea[] } }>(await request(f.baseUrl, `/projects/${projectId}`, {}, session));
  assert.equal(stillNoPackage.project.package, null);
  assert.equal(stillNoPackage.project.ideas.length, 10);

  failExpansion = false;
  const jobs = await data<{ jobs: Array<{ id: string; type: string; status: string }> }>(await request(f.baseUrl, '/jobs', {}, session));
  const latestFailed = jobs.jobs.find((job) => job.type === 'expand' && job.status === 'failed');
  assert.ok(latestFailed);
  const retried = await request(f.baseUrl, `/jobs/${latestFailed.id}/retry`, { method: 'POST' }, session);
  assert.equal(retried.status, 202);
  await f.app.worker.runNext();
  const recovered = await data<{ project: { package: StoryPackage | null } }>(await request(f.baseUrl, `/projects/${projectId}`, {}, session));
  assert.ok(recovered.project.package);
});

test('startup marks running jobs interrupted and refuses an unsupported database schema', async (t) => {
  const f = await fixture(t);
  const owner = await createOwner(f.baseUrl);
  const authState = await data<{ user: { id: string } }>(await request(f.baseUrl, '/auth/status', {}, owner));
  const project = await data<{ project: { id: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(projectInput),
  }, owner));
  const queued = await data<{ job: { id: string } }>(await request(f.baseUrl, `/projects/${project.project.id}/ideas`, { method: 'POST' }, owner));
  const db = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(queued.job.id);
  db.close();
  await new Promise<void>((done) => f.server.close(() => done()));
  await f.app.close();

  const restarted = await createApplication({ dataDir: f.dataDir, provider: provider(), allowedOrigins: [origin], startWorker: false });
  try {
    const recovered = restarted.store.listJobs(authState.user.id).find((job) => job.id === queued.job.id);
    assert.equal(recovered?.status, 'failed');
    assert.equal(recovered?.errorCode, 'INTERRUPTED');
  } finally { await restarted.close(); }

  const mismatch = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  mismatch.exec('PRAGMA user_version = 999');
  mismatch.close();
  assert.throws(() => createApplication({ dataDir: f.dataDir, provider: provider(), startWorker: false }), /Unsupported database schema/);
});
