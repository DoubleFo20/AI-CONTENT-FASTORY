import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { createConfiguredAiProvider } from '../server/ai/router.js';
import { createMockProvider } from '../server/ai/mock.js';
import type { Project } from '../shared/contracts.js';
import { MemoryCloudRepository } from '../server/cloud/memory.js';
interface TestPayload { csrfToken: string; project: Project }
type TestResponse = Omit<Response, 'json'> & { json(): Promise<TestPayload> };

// Injected synthetic Gemini only: this verifies integration, never live-provider success.
test('owner chooses Gemini via CSRF API, caches ten ideas, expands exactly one and persists provider usage', async t => {
  await mkdir(resolve('.tmp'), { recursive: true }); const dir = await mkdtemp(join(resolve('.tmp'), 'ai-integration-'));
  const mock = createMockProvider(); let ideasCalls = 0; let expandCalls = 0; let selectedId = '';
  const ai = createConfiguredAiProvider({ openaiApproved: true, mode: 'mock', apiKey: '', geminiApiKey: 'synthetic-only-key', gemini: {
    async generateIdeas(input, options) { ideasCalls++; options?.onUsage?.({ provider: 'gemini', operation: 'ideas', model: 'synthetic-model', inputTokens: 100, outputTokens: 200, totalTokens: 300 }); return mock.generateIdeas(input); },
    async expandStory(input, idea, options) { expandCalls++; selectedId = idea.id; assert.equal('ideas' in input, false); options?.onUsage?.({ provider: 'gemini', operation: 'expand', model: 'synthetic-model', inputTokens: 150, outputTokens: 400, totalTokens: 550 }); return mock.expandStory(input, idea); },
  } });
  const origin = 'http://127.0.0.1:5173';
  const application = createApplication({ dataDir: dir, provider: ai.provider, startWorker: false, allowedOrigins: [origin], integrations: { aiStatus: ai.status, setAiMode: ai.setMode } });
  const server = createServer(application.app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(async () => { await new Promise<void>(yes => server.close(() => yes())); await application.close(); await rm(dir, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api`;
  let cookie = ''; let csrf = '';
  const call = (path: string, method = 'GET', body?: unknown, authenticated = true, withCsrf = true) => fetch(`${base}${path}`, { method, headers: {
    Origin: origin, 'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {}), ...(withCsrf && csrf ? { 'X-CSRF-Token': csrf } : {}),
  }, body: body === undefined ? undefined : JSON.stringify(body) }) as Promise<TestResponse>;
  const setup = await call('/auth/setup', 'POST', { username: 'synthetic_owner', password: 'synthetic-password-2026' }); assert.equal(setup.status, 201);
  cookie = setup.headers.get('set-cookie')!.split(';')[0]; csrf = (await setup.json()).csrfToken;
  assert.equal((await call('/integrations/ai/mode', 'POST', { mode: 'gemini' }, false)).status, 401);
  assert.equal((await call('/integrations/ai/mode', 'POST', { mode: 'gemini' }, true, false)).status, 403);
  assert.equal((await call('/integrations/ai/mode', 'POST', { mode: 'gemini' })).status, 200);
  const created = await call('/projects', 'POST', { name: 'Synthetic Gemini integration', brief: 'A child returns an umbrella in a warm short story.', genre: 'Drama', audience: 'General', aspectRatio: '9:16', targetDurationSeconds: 45 });
  assert.equal(created.status, 201); const id = (await created.json()).project.id;
  assert.equal((await call(`/projects/${id}/ideas`, 'POST')).status, 202);
  assert.equal((await call('/integrations/ai/mode', 'POST', { mode: 'mock' })).status, 409);
  await application.worker.runNext();
  let project: Project = (await (await call(`/projects/${id}`)).json()).project;
  assert.equal(project.ideas.length, 10); assert.equal(project.generation?.ideas, 'gemini'); assert.equal(project.aiUsage?.length, 1);
  assert.equal((await call(`/projects/${id}/ideas`, 'POST')).status, 409); assert.equal(ideasCalls, 1);
  assert.equal((await call(`/projects/${id}/select`, 'POST', { ideaId: project.ideas[5].id })).status, 200);
  assert.equal((await call(`/projects/${id}/expand`, 'POST')).status, 202); await application.worker.runNext();
  project = (await (await call(`/projects/${id}`)).json()).project;
  assert.equal(expandCalls, 1); assert.equal(selectedId, project.selectedIdeaId); assert.equal(project.generation?.expansion, 'gemini');
  assert.equal(project.aiUsage?.length, 2); assert.ok(project.aiUsage?.every(receipt => receipt.estimatedCostUsd === null));
  assert.match(project.package!.scenes[0].explanationTh, /[\u0E00-\u0E7F]/); assert.doesNotMatch(project.package!.scenes[0].flowPromptEn, /[\u0E00-\u0E7F]/);
  assert.equal((await call('/integrations/ai/mode', 'POST', { mode: 'mock' })).status, 200);
  assert.equal((await (await call(`/projects/${id}`)).json()).project.generation?.ideas, 'gemini'); assert.equal(ideasCalls, 1);
});

test('configured cloud integration locks shared provider changes even before a claim', async t => {
  await mkdir(resolve('.tmp'), { recursive: true }); const dir = await mkdtemp(join(resolve('.tmp'), 'cloud-mode-lock-'));
  const ai = createConfiguredAiProvider({ openaiApproved: true, mode: 'mock', geminiApiKey: 'synthetic-only-key', gemini: createMockProvider() });
  const origin = 'http://127.0.0.1:5173';
  const application = createApplication({ dataDir: dir, provider: ai.provider, startWorker: false, integrations: { aiStatus: ai.status, setAiMode: ai.setMode, cloudRepository: new MemoryCloudRepository() }, allowedOrigins: [origin] });
  const server = createServer(application.app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  t.after(async () => { await new Promise<void>(yes => server.close(() => yes())); await application.close(); await rm(dir, { recursive: true, force: true }); });
  const address = server.address(); assert.ok(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api`;
  const setup = await fetch(`${base}/auth/setup`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'synthetic_owner', password: 'synthetic-password-2026' }) });
  assert.equal(setup.status, 201); const cookie = setup.headers.get('set-cookie')!.split(';')[0]; const auth = await setup.json() as TestPayload;
  const headers = { Origin: origin, Cookie: cookie, 'X-CSRF-Token': auth.csrfToken, 'Content-Type': 'application/json' };
  const capabilities = await (await fetch(`${base}/integrations/capabilities`, { headers })).json() as { capabilities: { ai: { modeChangeLocked: boolean } } };
  assert.equal(capabilities.capabilities.ai.modeChangeLocked, true);
  const response = await fetch(`${base}/integrations/ai/mode`, { method: 'POST', headers, body: JSON.stringify({ mode: 'gemini' }) });
  assert.equal(response.status, 409); assert.equal((await response.json() as { error: { code: string } }).error.code, 'AI_MODE_LOCKED');
  assert.equal(ai.status().active, 'mock');
});
