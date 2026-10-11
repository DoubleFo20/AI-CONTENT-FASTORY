import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApplication } from '../server/app.js';
import { createGeminiProvider } from '../server/ai/gemini.js';
import { AiProviderError } from '../server/ai/provider.js';
import { GeminiExpansionDraftSchema, assembleGeminiStoryPackage } from '../server/ai/gemini-expansion.js';
import type { AiProvider } from '../server/ai/types.js';
import type { Idea, ProjectInput, StoryPackage } from '../shared/contracts.js';

const origin = 'http://127.0.0.1:5173';
const key = 'test-only-gemini-key-not-a-real-secret';
const input: ProjectInput = {
  name: 'Rain', brief: 'A traveler finds a lost umbrella during a storm.',
  genre: 'Drama', audience: 'General audience', aspectRatio: '9:16',
};
const ideas: Idea[] = Array.from({ length: 10 }, (_, index) => ({
  id: `idea_${index + 1}`, title: { th: `เรื่อง ${index + 1}`, en: `Story ${index + 1}` },
  logline: { th: `เรื่องย่อ ${index + 1}`, en: `Logline ${index + 1}` }, hook: { th: `จุดเด่น ${index + 1}`, en: `Hook ${index + 1}` },
}));

interface GeminiRequestBody {
  store: boolean;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig: {
    candidateCount: number;
    maxOutputTokens: number;
    responseMimeType: string;
    responseJsonSchema: GeminiSchemaNode;
  };
}

interface GeminiSchemaNode {
  type: string;
  properties?: Record<string, GeminiSchemaNode>;
  required?: string[];
  additionalProperties?: boolean;
  items?: GeminiSchemaNode;
}

function makeDraft(): Record<string, unknown> {
  return {
    storyTh: 'มะลิออกตามหาร่มที่หายไปท่ามกลางพายุ',
    storyEn: 'Mali searches for her lost umbrella during a storm.',
    characters: [
      { name: 'Mali', visualDescriptionEn: 'Young woman in a blue raincoat.', backgroundTh: 'นักเดินทางผู้ใจเย็น', backgroundEn: 'A calm traveler.' },
      { name: 'Ton', visualDescriptionEn: 'Young man carrying a yellow umbrella.', backgroundTh: 'คนแปลกหน้าผู้ช่วยเหลือ', backgroundEn: 'A helpful stranger.' },
    ],
    locations: [
      { nameTh: 'ป้ายรถเมล์', nameEn: 'Bus stop', visualDescriptionEn: 'Small city bus stop in rain.', descriptionTh: 'ป้ายรถเมล์ริมถนน', descriptionEn: 'A roadside bus stop.' },
      { nameTh: 'สวน', nameEn: 'Garden', visualDescriptionEn: 'Quiet garden after rain.', descriptionTh: 'สวนเงียบสงบ', descriptionEn: 'A quiet garden.' },
    ],
    rules: [{ th: 'เสื้อกันฝนของมะลิเป็นสีน้ำเงิน', en: 'Mali always wears the blue raincoat.' }],
    scenes: [1, 2, 3].map((n) => ({
      titleTh: `ฉาก ${n}`, titleEn: `Scene ${n}`, durationSeconds: 20,
      explanationTh: `มะลิเดินทางต่อในฉาก ${n}`,
      flowPromptEn: `Mali in the same blue raincoat, bus stop scene ${n}.`,
      narrationTh: `เสียงบรรยาย ${n}`, narrationEn: `Narration ${n}`,
      characterIndices: n === 1 ? [1] : [1, 2], locationIndex: n === 3 ? 2 : 1,
    })),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function candidate(payload: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] } }], ...extra };
}

function safeError(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof AiProviderError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.doesNotMatch(error.message, /private|test-only/);
    return true;
  };
}

test('expansion draft assembles a stable localized package in source order without mutating input', () => {
  const raw = makeDraft();
  const before = structuredClone(raw);
  const result: StoryPackage = assembleGeminiStoryPackage(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(result.storyBible, { th: before.storyTh, en: before.storyEn });
  assert.deepEqual(result.characters.map(({ id, name }) => ({ id, name })), [
    { id: 'character_1', name: 'Mali' }, { id: 'character_2', name: 'Ton' },
  ]);
  assert.deepEqual(result.locations.map(({ id, name }) => ({ id, name })), [
    { id: 'location_1', name: { th: 'ป้ายรถเมล์', en: 'Bus stop' } },
    { id: 'location_2', name: { th: 'สวน', en: 'Garden' } },
  ]);
  assert.deepEqual(result.continuityRules, before.rules);
  assert.deepEqual(result.scenes.map(({ id, order, characterIds, locationId }) => ({ id, order, characterIds, locationId })), [
    { id: 'scene_1', order: 1, characterIds: ['character_1'], locationId: 'location_1' },
    { id: 'scene_2', order: 2, characterIds: ['character_1', 'character_2'], locationId: 'location_1' },
    { id: 'scene_3', order: 3, characterIds: ['character_1', 'character_2'], locationId: 'location_2' },
  ]);
  assert.equal(result.scenes[0].explanationTh, 'มะลิเดินทางต่อในฉาก 1');
  assert.equal(result.scenes[0].flowPromptEn, 'Mali in the same blue raincoat, bus stop scene 1.');
  assert.equal(result.scenes.reduce((total, scene) => total + scene.durationSeconds, 0), 60);
});

test('expansion draft rejects missing, extra, invalid, duplicate, fractional and overlong references without repair', () => {
  const valid = makeDraft();
  const bad: unknown[] = [];
  bad.push({ ...valid, extra: true });
  bad.push(Object.fromEntries(Object.entries(valid).filter(([key]) => key !== 'rules')));
  bad.push({ ...valid, storyTh: '' });
  bad.push({ ...valid, characters: [] });
  bad.push({ ...valid, characters: Array.from({ length: 7 }, (_, index) => ({ ...((valid.characters as object[])[0]), name: `C${index}` })) });
  bad.push({ ...valid, locations: [] });
  bad.push({ ...valid, rules: [] });
  bad.push({ ...valid, rules: Array.from({ length: 13 }, () => ({ th: 'กฎ', en: 'Rule' })) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).slice(0, 2) });
  bad.push({ ...valid, scenes: Array.from({ length: 13 }, (_, index) => ({ ...((valid.scenes as Record<string, unknown>[])[0]), titleEn: `Scene ${index}` })) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).map((scene, index) => index ? scene : { ...scene, durationSeconds: 3.5 }) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).map((scene, index) => index ? scene : { ...scene, characterIndices: [1, 1] }) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).map((scene, index) => index ? scene : { ...scene, characterIndices: [3] }) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).map((scene, index) => index ? scene : { ...scene, characterIndices: [1.5] }) });
  bad.push({ ...valid, scenes: (valid.scenes as Record<string, unknown>[]).map((scene, index) => index ? scene : { ...scene, locationIndex: 3 }) });
  bad.push({ ...valid, scenes: Array.from({ length: 10 }, (_, index) => ({ ...((valid.scenes as Record<string, unknown>[])[0]), titleEn: `Scene ${index}`, durationSeconds: 20 })) });
  for (const value of bad) {
    assert.equal(GeminiExpansionDraftSchema.safeParse(value).success, false);
    assert.throws(() => assembleGeminiStoryPackage(value));
  }
});

test('Gemini expansion sends the reduced draft schema, preserves prompt privacy, and retains usage for assembled output', async () => {
  let calls = 0;
  let requestBody!: GeminiRequestBody;
  const usage: unknown[] = [];
  const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, fetch: async (_url, init) => {
    calls += 1;
    requestBody = JSON.parse(String(init?.body)) as GeminiRequestBody;
    return jsonResponse(candidate(makeDraft(), { usageMetadata: {
      promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 350,
    } }));
  } });
  const privateInput = Object.assign({}, input, { ideas: ['PRIVATE_ALTERNATIVE'], package: 'PRIVATE_PACKAGE' });
  const selected = { ...ideas[0], secret: 'PRIVATE_SELECTION' };
  const result = await provider.expandStory(privateInput, selected, { onUsage: value => usage.push(value) });
  assert.equal(calls, 1);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.generationConfig.candidateCount, 1);
  assert.equal(requestBody.generationConfig.maxOutputTokens, 12000);
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  const wire = requestBody.generationConfig.responseJsonSchema;
  const wireText = JSON.stringify(wire);
  assert.match(wireText, /storyTh/);
  assert.match(wireText, /characterIndices/);
  assert.doesNotMatch(wireText, /minLength|maxLength|minimum|maximum|\$schema|minItems|maxItems/);
  const prompt = requestBody.contents[0].parts[0].text as string;
  assert.match(prompt, /ONLY the single selected idea/);
  assert.match(prompt, /idea_1/);
  assert.doesNotMatch(prompt, /PRIVATE_ALTERNATIVE|PRIVATE_PACKAGE|PRIVATE_SELECTION/);
  assert.equal(result.scenes[0].flowPromptEn, (makeDraft().scenes as Record<string, unknown>[])[0].flowPromptEn);
  assert.equal(usage.length, 1);
  assert.deepEqual(usage[0], { provider: 'gemini', operation: 'expand', model: 'gemini-3.5-flash-lite', inputTokens: 100, outputTokens: 250, totalTokens: 350, reasoningTokens: 50 });
});

test('Gemini rejects invalid expansion and HTTP/quota failures after exactly one request', async () => {
  const malformed = makeDraft();
  (malformed.scenes as Record<string, unknown>[])[0].locationIndex = 99;
  for (const [response, expected] of [
    [jsonResponse(candidate(malformed)), 'AI_INVALID_OUTPUT'],
    [jsonResponse({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'googleapis.com', reason: 'QUOTA_EXCEEDED' }] } }, 429), 'AI_QUOTA_EXCEEDED'],
    [jsonResponse({ error: { status: 'INVALID_ARGUMENT' } }, 400), 'AI_REQUEST_FAILED'],
  ] as const) {
    let calls = 0;
    const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, fetch: async () => { calls += 1; return response; } });
    await assert.rejects(provider.expandStory(input, ideas[0]), safeError(expected));
    assert.equal(calls, 1, 'bad output and provider errors must not trigger a repair or fallback request');
  }
});

test('Gemini honors cancellation during expansion without late usage or a second request', async () => {
  let calls = 0;
  let resolveFetch!: (response: Response) => void;
  const controller = new AbortController();
  const usage: unknown[] = [];
  const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, fetch: async () => {
    calls += 1;
    return new Promise<Response>(resolve => { resolveFetch = resolve; });
  } });
  const pending = provider.expandStory(input, ideas[0], { signal: controller.signal, onUsage: value => usage.push(value) });
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(pending, safeError('AI_TIMEOUT'));
  resolveFetch(jsonResponse(candidate(makeDraft(), { usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 } })));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(usage.length, 0);
});

interface Session { cookie: string; csrf: string; userId: string; username: string; password: string }
interface ApiFixture {
  baseUrl: string;
  server: Server;
  app: Awaited<ReturnType<typeof createApplication>>;
  dataDir: string;
  close(): Promise<void>;
}

async function fixture(t: TestContext, provider: AiProvider): Promise<ApiFixture> {
  const root = resolve('.tmp');
  await mkdir(root, { recursive: true });
  const dataDir = await mkdtemp(join(root, 'gemini-expansion-'));
  const app = await createApplication({ dataDir, provider, allowedOrigins: [origin], startWorker: false });
  const server = createServer(app.app);
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}/api`;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise<void>((resolveClose, rejectClose) => server.close(error => error ? rejectClose(error) : resolveClose()));
    await app.close();
  };
  t.after(async () => {
    await close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return { baseUrl, server, app, dataDir, close };
}

async function request(baseUrl: string, path: string, options: RequestInit = {}, session?: Session): Promise<Response> {
  const headers = new Headers(options.headers);
  if (session) headers.set('Cookie', session.cookie);
  if (options.method && options.method !== 'GET' && options.method !== 'HEAD') headers.set('Origin', origin);
  if (session && options.method && options.method !== 'GET' && options.method !== 'HEAD') headers.set('X-CSRF-Token', session.csrf);
  return fetch(`${baseUrl}${path}`, { ...options, headers });
}

async function body<T>(response: Response): Promise<T> {
  const result = await response.json() as T;
  assert.ok(response.status < 400, JSON.stringify(result));
  return result;
}

async function setup(baseUrl: string): Promise<Session> {
  const username = 'gemini_qa_owner';
  const password = 'gemini-qa-test-password-2026';
  const response = await request(baseUrl, '/auth/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 201);
  const state = await response.json() as { user: { id: string }; csrfToken: string };
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  assert.ok(cookie);
  return { cookie, csrf: state.csrfToken, userId: state.user.id, username, password };
}

test('API stores only the expanded selected story, recovers after one explicit safe retry, and persists the receipt', async t => {
  let ideaCalls = 0;
  let expansionCalls = 0;
  let failExpansion = true;
  const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, fetch: async (_url, init) => {
    const requestBody = JSON.parse(String(init?.body)) as { contents: Array<{ parts: Array<{ text: string }> }> };
    const prompt = requestBody.contents[0].parts[0].text;
    if (/exactly 10 distinct SHORT story ideas/.test(prompt)) {
      ideaCalls += 1;
      return jsonResponse(candidate({ ideas }));
    }
    expansionCalls += 1;
    assert.match(prompt, /ONLY the single selected idea/);
    assert.match(prompt, /idea_4/);
    assert.doesNotMatch(prompt, /idea_3|idea_5|idea_6|idea_7|idea_8|idea_9|idea_10/);
    if (failExpansion) {
      return jsonResponse(candidate({ ...makeDraft(), privateBadOutput: true }, { usageMetadata: {
        promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 350,
      } }));
    }
    return jsonResponse(candidate(makeDraft(), { usageMetadata: {
      promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 350,
    } }));
  } });
  const f = await fixture(t, provider);
  const session = await setup(f.baseUrl);
  assert.equal((await request(f.baseUrl, `/projects`, {}, { ...session, cookie: 'invalid-session-token' })).status, 401,
    'an unauthenticated caller cannot access project data');
  const created = await body<{ project: { id: string } }>(await request(f.baseUrl, '/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }, session));
  const projectId = created.project.id;
  await body(await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, session));
  assert.equal(await f.app.worker.runNext(), true);
  assert.equal(ideaCalls, 1);
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/ideas`, { method: 'POST' }, session)).status, 409);
  assert.equal(ideaCalls, 1, 'duplicate ideas enqueue must not make another provider request');
  const selected = await body<{ project: { selectedIdeaId: string } }>(await request(f.baseUrl, `/projects/${projectId}/select`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ideaId: 'idea_4' }),
  }, session));
  assert.equal(selected.project.selectedIdeaId, 'idea_4');
  const queued = await body<{ job: { id: string } }>(await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, session));
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, session)).status, 409);
  assert.equal(expansionCalls, 0, 'duplicate expansion enqueue must not start a provider request');
  await f.app.worker.runNext();
  const failed = await body<{ project: { package: StoryPackage | null; ideas: Idea[]; selectedIdeaId: string } }>(
    await request(f.baseUrl, `/projects/${projectId}`, {}, session));
  assert.equal(failed.project.package, null);
  assert.equal(failed.project.ideas.length, 10);
  assert.equal(failed.project.selectedIdeaId, 'idea_4');
  const jobs = await body<{ jobs: Array<{ id: string; status: string }> }>(await request(f.baseUrl, '/jobs', {}, session));
  assert.equal(jobs.jobs.find(job => job.id === queued.job.id)?.status, 'failed');
  assert.equal(expansionCalls, 1, 'an invalid response must not auto-repair itself');

  failExpansion = false;
  const retry = await body<{ job: { id: string } }>(await request(f.baseUrl, `/jobs/${queued.job.id}/retry`, { method: 'POST' }, session));
  await f.app.worker.runNext();
  const recovered = await body<{ project: { package: StoryPackage | null; ideas: Idea[]; selectedIdeaId: string; aiUsage?: Array<{ operation: string }> } }>(
    await request(f.baseUrl, `/projects/${projectId}`, {}, session));
  assert.equal(recovered.project.ideas.length, 10);
  assert.equal(recovered.project.selectedIdeaId, 'idea_4');
  assert.deepEqual(recovered.project.package, assembleGeminiStoryPackage(makeDraft()));
  assert.ok(recovered.project.aiUsage?.some(receipt => receipt.operation === 'expand'));
  assert.equal(expansionCalls, 2);
  assert.equal(ideaCalls, 1, 'retrying expansion must preserve existing ideas without regenerating them');
  const completedJobs = await body<{ jobs: Array<{ id: string; type: string; status: string }> }>(await request(f.baseUrl, '/jobs', {}, session));
  assert.equal(completedJobs.jobs.find(job => job.id === queued.job.id)?.status, 'failed', 'the original failed job remains in history');
  assert.equal(completedJobs.jobs.find(job => job.id === retry.job.id)?.status, 'completed');
  assert.equal((await request(f.baseUrl, `/projects/${projectId}/expand`, { method: 'POST' }, session)).status, 409,
    'a completed package must not be generated again implicitly');
  assert.equal(expansionCalls, 2, 'completed-package conflict must not make another provider request');

  const database = new DatabaseSync(join(f.dataDir, 'factory.sqlite'));
  try {
    const version = database.prepare('PRAGMA user_version').get() as { user_version: number };
    const account = database.prepare('SELECT username FROM users WHERE id = ?').get(session.userId) as { username: string } | undefined;
    assert.equal(version.user_version, 1);
    assert.equal(account?.username, session.username);
  } finally {
    database.close();
  }

  await f.close();
  const reopened = await createApplication({ dataDir: f.dataDir, provider, allowedOrigins: [origin], startWorker: false });
  const reopenedServer = createServer(reopened.app);
  await new Promise<void>((resolveListen, reject) => {
    reopenedServer.once('error', reject);
    reopenedServer.listen(0, '127.0.0.1', resolveListen);
  });
  const reopenedAddress = reopenedServer.address();
  assert.ok(reopenedAddress && typeof reopenedAddress !== 'string');
  const reopenedUrl = `http://127.0.0.1:${reopenedAddress.port}/api`;
  try {
    const auth = await body<{ user: { id: string; username: string }; setupRequired: boolean }>(await request(reopenedUrl, '/auth/status', {}, session));
    assert.equal(auth.user.id, session.userId);
    assert.equal(auth.user.username, session.username);
    assert.equal(auth.setupRequired, false);
    assert.equal((await request(reopenedUrl, `/projects/${projectId}`)).status, 401);
    const persisted = await body<{ project: { package: StoryPackage | null; ideas: Idea[]; selectedIdeaId: string } }>(
      await request(reopenedUrl, `/projects/${projectId}`, {}, session));
    assert.deepEqual(persisted.project.package, recovered.project.package);
    assert.equal(persisted.project.ideas.length, 10);
    assert.equal(persisted.project.selectedIdeaId, 'idea_4');
  } finally {
    await new Promise<void>((resolveClose, rejectClose) => reopenedServer.close(error => error ? rejectClose(error) : resolveClose()));
    await reopened.close();
  }
});
