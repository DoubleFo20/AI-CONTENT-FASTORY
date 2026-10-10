import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { createConfiguredAiProvider } from '../server/ai/router.js';
import { createMockProvider } from '../server/ai/mock.js';
import { AiProviderError } from '../server/ai/provider.js';
import { EditorSettingsSchema } from '../shared/production.js';
import type { Project, Job } from '../shared/contracts.js';
import type { AudioAsset, ProductionState } from '../shared/production.js';

interface TestPayload {
  csrfToken: string; project: Project; job: Job; jobs: Job[]; state: ProductionState; asset: AudioAsset & { filename?: string };
  estimate: { generations: number; estimatedCredits: number | null; withinBudget: boolean | null; spendsCredits: false };
  scenes: Array<{ id: string; promptEn: string; flowPromptEn: string }>;
  matches: Array<{ filename: string; sceneId: string | null }>;
}
type TestResponse = Omit<Response, 'json'> & { json(): Promise<TestPayload> };

const origin = 'http://127.0.0.1:5173';
const brief = { name: 'แม่หมาป่าผู้ปกป้องลูกกวาง', brief: 'แม่หมาป่าพาลูกกวางที่หลงทางกลับบ้านอย่างปลอดภัย', genre: 'อบอุ่น', audience: 'ทั่วไป', aspectRatio: '9:16' as const, targetDurationSeconds: 12 };
async function fixture(t: TestContext) {
  await mkdir(resolve('.tmp'), { recursive: true }); const dir = await mkdtemp(join(resolve('.tmp'), 'production-test-'));
  let paidCalls = 0;
  const ai = createConfiguredAiProvider({ mode: 'openai', apiKey: 'synthetic-test-only', stateFile: join(dir, 'settings', 'mode.json'), openai: { ...createMockProvider(), async generateIdeas() { paidCalls++; throw new AiProviderError('AI_QUOTA_EXCEEDED'); } } });
  const application = createApplication({ dataDir: dir, provider: ai.provider, startWorker: false, allowedOrigins: [origin], integrations: { aiStatus: ai.status, setAiMode: ai.setMode } });
  const server = createServer(application.app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api`;
  let cookie = ''; let csrf = '';
  async function call(path: string, method = 'GET', body?: unknown, authenticated = true) {
    const headers = new Headers(); if (authenticated && cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') { headers.set('Origin', origin); if (authenticated && csrf) headers.set('X-CSRF-Token', csrf); }
    let payload: string | FormData | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers.set('Content-Type', 'application/json'); payload = JSON.stringify(body); }
    return await fetch(`${base}${path}`, { method, headers, body: payload }) as TestResponse;
  }
  const setup = await call('/auth/setup', 'POST', { username: 'synthetic_owner', password: 'synthetic-password-2026' });
  assert.equal(setup.status, 201); cookie = setup.headers.get('set-cookie')!.split(';')[0]; csrf = (await setup.json()).csrfToken;
  const response = await call('/projects', 'POST', brief); assert.equal(response.status, 201); const project: Project = (await response.json()).project;
  t.after(async () => { await new Promise<void>(yes => server.close(() => yes())); await application.close(); await rm(dir, { recursive: true, force: true }); });
  return { application, ai, dir, call, project, paidCalls: () => paidCalls };
}
async function ready(f: Awaited<ReturnType<typeof fixture>>) {
  const id = f.project.id;
  assert.equal((await f.call('/integrations/ai/mode', 'POST', { mode: 'mock' })).status, 200);
  assert.equal((await f.call(`/projects/${id}/ideas`, 'POST')).status, 202); await f.application.worker.runNext();
  let p: Project = (await (await f.call(`/projects/${id}`)).json()).project;
  assert.equal((await f.call(`/projects/${id}/select`, 'POST', { ideaId: p.ideas[4].id })).status, 200);
  assert.equal((await f.call(`/projects/${id}/expand`, 'POST')).status, 202); await f.application.worker.runNext();
  p = (await (await f.call(`/projects/${id}`)).json()).project; return p;
}

test('quota failure is observable; explicit mode change never retries and manual Mock recovery produces ten cached ideas', async t => {
  const f = await fixture(t); const id = f.project.id;
  const queued = await f.call(`/projects/${id}/ideas`, 'POST'); const job: Job = (await queued.json()).job;
  assert.equal((await f.call('/integrations/ai/mode', 'POST', { mode: 'mock' })).status, 409);
  await f.application.worker.runNext();
  let jobs: Job[] = (await (await f.call('/jobs')).json()).jobs;
  assert.equal(jobs[0].errorCode, 'AI_QUOTA_EXCEEDED'); assert.equal(jobs[0].status, 'failed'); assert.equal(f.paidCalls(), 1);
  assert.equal((await f.call('/integrations/ai/mode', 'POST', { mode: 'mock' })).status, 200);
  assert.equal(f.paidCalls(), 1); assert.equal(f.application.store.project(f.application.store.credentials('synthetic_owner')!.user.id, id).ideas.length, 0);
  assert.equal((await f.call(`/jobs/${job.id}/retry`, 'POST')).status, 202); await f.application.worker.runNext();
  const project: Project = (await (await f.call(`/projects/${id}`)).json()).project;
  assert.equal(project.ideas.length, 10); assert.equal(project.generation?.ideas, 'mock');
  assert.equal((await f.call(`/projects/${id}/ideas`, 'POST')).status, 409);
  assert.equal((await f.call('/integrations/ai/mode', 'POST', { mode: 'openai' })).status, 200);
  assert.equal((await (await f.call(`/projects/${id}`)).json()).project.generation?.ideas, 'mock'); assert.equal(f.paidCalls(), 1);
  jobs = (await (await f.call('/jobs')).json()).jobs; assert.equal(jobs.length, 2);
});
test('cancel and runtime status endpoints require owner authentication and preserve a terminal cancellation', async t => {
  const f = await fixture(t);
  const response = await f.call(`/projects/${f.project.id}/ideas`, 'POST'); const job = (await response.json()).job;
  assert.equal((await f.call(`/jobs/${job.id}/cancel`, 'POST', undefined, false)).status, 401);
  assert.equal((await f.call('/queue/status', 'GET', undefined, false)).status, 401);
  assert.equal((await f.call(`/jobs/${job.id}/cancel`, 'POST')).status, 200);
  assert.equal(await f.application.worker.runNext(), false); assert.equal(f.paidCalls(), 0);
  assert.equal((await (await f.call('/jobs')).json()).jobs[0].errorCode, 'JOB_CANCELLED');
});
test('selected expansion produces Thai explanations, English continuity prompts and owner-verified credit estimates', async t => {
  const f = await fixture(t); const project = await ready(f); const id = project.id;
  assert.equal(project.package!.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), 12);
  assert.equal(project.generation?.expansion, 'mock');
  let data = await (await f.call(`/projects/${id}/production`)).json(); assert.equal(data.estimate.estimatedCredits, null);
  assert.equal((await f.call(`/projects/${id}/production`, 'POST', { flow: { model: 'Owner verified test rate', creditsPerGeneration: 20, generationDurationSeconds: 4, budgetCredits: 50, rateVerifiedByOwner: true }, scenes: { mock_scene_1: { status: 'ready_for_flow', characterReference: 'character-reference-01', locationReference: 'location-reference-01', notes: 'เตรียมพร้อม' } } })).status, 200);
  data = await (await f.call(`/projects/${id}/production`)).json(); assert.equal(data.estimate.estimatedCredits, 60); assert.equal(data.estimate.withinBudget, false); assert.equal(data.estimate.spendsCredits, false);
  assert.match(data.scenes[0].promptEn, /Scene ID: mock_scene_1.*9:16/); assert.match(data.scenes[0].promptEn, /character-reference-01/); assert.match(data.scenes[0].promptEn, /blue jacket/); assert.doesNotMatch(data.scenes[0].promptEn, /[\u0E00-\u0E7F]/);
  assert.match(project.package!.scenes[0].explanationTh, /[\u0E00-\u0E7F]/);
  const pack = await (await f.call(`/projects/${id}/prompt-pack`)).json(); assert.equal(pack.scenes[0].flowPromptEn, data.scenes[0].promptEn);
});
test('production settings and filename matching reject foreign scenes, invalid order and unauthenticated access', async t => {
  const f = await fixture(t); const project = await ready(f); const path = `/projects/${project.id}/production`;
  assert.equal((await f.call(path, 'GET', undefined, false)).status, 401);
  assert.equal((await f.call(path, 'POST', { scenes: { foreign_scene: { status: 'generating' } } })).status, 400);
  assert.equal((await f.call(path, 'POST', { editor: { sceneOrder: ['mock_scene_1'] } })).status, 400);
  assert.equal((await f.call(path, 'POST', { editor: { musicAssetId: '00000000-0000-4000-8000-000000000001' } })).status, 400);
  const response = await f.call(`/projects/${project.id}/clip-match`, 'POST', { filenames: ['mock_scene_1.mp4', 'mock_scene_2__take02.mov', 'unmatched.mp4', '../mock_scene_1.mp4'] });
  assert.deepEqual((await response.json()).matches.map((item: { sceneId: string | null }) => item.sceneId), ['mock_scene_1','mock_scene_2',null,null]);
  const saved = await f.call(path, 'POST', { editor: EditorSettingsSchema.parse({ resolution: '720p', transition: 'fade', subtitleLocale: 'th', sceneOrder: project.package!.scenes.map(scene => scene.id).reverse() }) }); assert.equal(saved.status, 200);
  const state: ProductionState = (await (await f.call(path)).json()).state; assert.equal(state.editor.subtitleLocale, 'th');
  assert.equal(state.editor.sceneOrder[0], 'mock_scene_3'); assert.doesNotMatch(JSON.stringify(state), /filename|password|csrf|apiKey/);
});
test('audio upload validates real media and stores owner-scoped metadata without exposing managed paths', async t => {
  const f = await fixture(t); const id = f.project.id;
  const wave = Buffer.alloc(44 + 1600); wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(8000, 24); wave.writeUInt32LE(16000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(1600, 40);
  const body = new FormData(); body.append('audio', new Blob([wave], { type: 'audio/wav' }), 'synthetic.wav');
  const response = await f.call(`/projects/${id}/audio`, 'POST', body); assert.equal(response.status, 201);
  const asset = (await response.json()).asset; assert.equal(asset.projectId, id); assert.ok(asset.durationSeconds > 0); assert.equal(asset.filename, undefined);
  assert.equal((await f.call(`/projects/${id}/audio/${asset.id}/file`)).status, 200);
  assert.equal((await f.call(`/projects/${id}/audio/${asset.id}/file`, 'GET', undefined, false)).status, 401);
  const bad = new FormData(); bad.append('audio', new Blob(['invalid']), 'invalid.wav'); assert.equal((await f.call(`/projects/${id}/audio`, 'POST', bad)).status, 400);
});
test('explicit mode persists across router restart without reading or writing API keys', async t => {
  const f = await fixture(t); f.ai.setMode('mock');
  const restarted = createConfiguredAiProvider({ mode: 'openai', apiKey: '', stateFile: join(f.dir, 'settings', 'mode.json') }); assert.equal(restarted.status().active, 'mock');
  assert.throws(() => restarted.setMode('openai'), { code: 'AI_NOT_CONFIGURED' });
});
test('mock honors variable story durations and preserves exactly one selected idea', async () => {
  const mock = createMockProvider(); const ideas = await mock.generateIdeas(brief);
  for (const duration of [12, 45, 90, 180]) {
    const result = await mock.expandStory({ ...brief, targetDurationSeconds: duration }, ideas[6]);
    assert.equal(result.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0), duration);
    assert.ok(result.scenes.every(scene => scene.durationSeconds >= 4 && scene.durationSeconds <= 20));
    assert.match(result.storyBible.en, new RegExp(ideas[6].title.en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
