import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from '../server/app.js';
import type { AiProvider } from '../server/ai/types.js';
import type { Idea } from '../shared/contracts.js';

// Standalone operator module stays outside the server build; importing it must be inert.
let importRequests = 0;
const { verifyGeminiLive, validateOrigin, GeminiVerificationError, main } = await (async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { importRequests++; throw new Error('Import must be inert'); };
  try { return await import(new URL('../scripts/verify-gemini-live.mjs', import.meta.url).href); }
  finally { globalThis.fetch = originalFetch; }
})();
const origin = 'http://127.0.0.1:3006';
const projectId = '9f9d8284-f656-4c04-88d8-81a709b8e5cc';
const jobId = '219a6f66-32c5-4d63-8852-a2f24fc1d96c';
const otherJobId = '6512978d-ed61-4c11-bfb3-2c4113ee996c';
const credentials = { username: 'test_operator', password: 'synthetic-password-only' };
const cookie = `acf_session=${'a'.repeat(64)}`;
const csrf = 'b'.repeat(64);
const model = 'gemini-3.5-flash-lite';
const canaryName = `ACF GEMINI FREE TIER CANARY ${otherJobId}`;
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });
const errorIs = (code: string) => (error: unknown) => error instanceof GeminiVerificationError && error instanceof Error && error.message === code;
const ideas: Idea[] = Array.from({ length: 10 }, (_, index) => ({ id: `idea_${index + 1}`,
  title: { th: `เรื่องที่ ${index + 1}`, en: `Story ${index + 1}` }, logline: { th: 'เพื่อนบ้านร่วมกันแก้ปัญหา', en: 'Neighbors solve a small problem.' },
  hook: { th: 'ความลับในกล่องจดหมาย', en: 'A secret in the letterbox.' } }));
const capabilities = { ai: { mode: 'gemini', active: 'gemini', fallbackReason: null }, structuredData: { active: 'sqlite', configured: false },
  execution: { active: 'local', cloudDeploymentVerified: false } };
const receipt = { provider: 'gemini', operation: 'ideas', model, jobId, inputTokens: 17, outputTokens: 41, totalTokens: 58,
  recordedAt: '2026-10-10T00:00:00.000Z', estimatedCostUsd: null, rateVerifiedAt: null };
interface Event { status: string; projectId?: string; jobId?: string; ideasCount?: number; usage?: Record<string, number> }
interface Control {
  capabilities?: unknown; changedCapabilities?: unknown; resume?: 'cached' | 'running' | 'failed' | 'empty' | 'ambiguous';
  projectName?: string; failedCode?: string; pending?: boolean; noUsage?: boolean; completed?: Record<string, unknown>;
  response?: (path: string, method: string) => Response | undefined; hang?: string; hangBody?: string;
}
function fixture(control: Control = {}) {
  const calls: Array<{ path: string; method: string; headers: Headers }> = [];
  const events: Event[] = [];
  let projectName = control.projectName ?? canaryName; let time = 0; let preflights = 0; let polls = 0;
  const project = (complete: boolean) => ({ id: projectId, name: projectName, ideas: complete ? ideas : [], selectedIdeaId: null, package: null,
    ...(complete ? { generation: { ideas: 'gemini' }, ...(control.noUsage ? {} : { aiUsage: [receipt] }), ...control.completed } : {}) });
  const job = (status: string) => ({ id: jobId, projectId, projectName, type: 'ideas', status, errorCode: status === 'failed' ? control.failedCode ?? 'AI_REQUEST_FAILED' : null });
  const fetchImpl: typeof fetch = async (address, init) => {
    const url = new URL(String(address)); assert.equal(url.origin, origin);
    const path = url.pathname.replace(/^\/api/, ''); const method = init?.method ?? 'GET'; const headers = new Headers(init?.headers);
    calls.push({ path, method, headers });
    assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert(init?.signal);
    assert.equal(headers.get('Origin'), origin);
    if (path === '/auth/login') {
      assert.equal(headers.get('Cookie'), null); assert.equal(headers.get('X-CSRF-Token'), null);
      assert.deepEqual(JSON.parse(String(init?.body)), credentials);
    } else {
      assert.equal(headers.get('Cookie'), cookie);
      if (method === 'POST') assert.equal(headers.get('X-CSRF-Token'), csrf);
      assert(!String(init?.body).includes(credentials.password));
    }
    if (control.hang === path) return new Promise(() => {});
    if (control.hangBody === path) return new Response(new ReadableStream());
    const override = control.response?.(path, method); if (override) return override;
    if (path === '/auth/login') return json({ csrfToken: csrf }, 200, { 'Set-Cookie': `${cookie}; HttpOnly; SameSite=Strict; Path=/` });
    if (path === '/auth/logout') return json({ ok: true });
    if (path === '/integrations/capabilities') {
      preflights++;
      return json({ capabilities: preflights > 1 && control.changedCapabilities ? control.changedCapabilities : control.capabilities ?? capabilities });
    }
    if (path === '/projects' && method === 'POST') {
      const input = JSON.parse(String(init?.body)); projectName = input.name;
      assert.match(projectName, /^ACF GEMINI FREE TIER CANARY [a-f0-9-]{36}$/i);
      assert.equal(input.aspectRatio, '9:16');
      assert(!('apiKey' in input)); return json({ project: project(false) }, 201);
    }
    if (path === `/projects/${projectId}/ideas` && method === 'POST') {
      assert.deepEqual(JSON.parse(String(init?.body)), {}); return json({ job: job('queued') }, 202);
    }
    if (path === '/jobs') {
      polls++;
      const status = control.resume === 'failed' || control.failedCode ? 'failed' : control.pending || control.resume === 'running' && polls === 1 ? 'running' : 'completed';
      const records = control.resume === 'empty' ? [] : control.resume === 'ambiguous' ? [job(status), { ...job(status), id: otherJobId }] : [job(status)];
      // An unrelated Owner job is never touched or logged.
      return json({ jobs: [...records, { id: otherJobId, projectId: otherJobId, projectName: 'PRIVATE OWNER PROJECT', type: 'expand', status: 'running' }] });
    }
    if (path === `/projects/${projectId}`) return json({ project: project(control.resume === 'cached' || polls > 1 || !control.resume) });
    throw new Error('Unexpected request containing private details');
  };
  return { calls, events, get polls() { return polls; }, options: { origin, ...credentials, freeTierConfirmed: true, fetchImpl,
    log: (event: Event) => events.push(event), now: () => time, sleep: async (ms: number) => { time += ms; } } };
}
const ideasPosts = (f: ReturnType<typeof fixture>) => f.calls.filter(call => call.path.endsWith('/ideas') && call.method === 'POST');
const assertNoUnsafeWrites = (f: ReturnType<typeof fixture>) => {
  assert(f.calls.every(call => call.method === 'GET' || ['/auth/login', '/auth/logout', '/projects', `/projects/${projectId}/ideas`].includes(call.path)));
  assert(!f.calls.some(call => /select|expand|retry|cancel|mode|cloud|authorize/.test(call.path)));
};

test('import is inert and missing strict private Free Tier confirmation makes zero HTTP requests', async () => {
  assert.equal(importRequests, 0);
  const f = fixture();
  for (const confirmation of [undefined, false, 'true', 1]) {
    await assert.rejects(verifyGeminiLive({ ...f.options, freeTierConfirmed: confirmation }), errorIs('FREE_TIER_CONFIRMATION_REQUIRED'));
  }
  assert.equal(f.calls.length, 0);
});

test('noncanonical origins, credentials, IDs and deadlines fail before HTTP; HTTPS requires exact approval', async () => {
  const f = fixture();
  for (const bad of ['https://example.com', 'http://example.com', `${origin}/`, `${origin}/api`, `${origin}?q=x`,
    'http://user:secret@127.0.0.1:3006', 'http://2130706433:3006', 'http://0x7f000001:3006', 'http://127.1:3006']) {
    await assert.rejects(verifyGeminiLive({ ...f.options, origin: bad }), errorIs('INVALID_CONFIGURATION'));
  }
  for (const bad of [{ username: '' }, { password: '' }, { projectId: '../owner' }, { pollTimeoutMs: Infinity }, { requestTimeoutMs: 0 }]) {
    await assert.rejects(verifyGeminiLive({ ...f.options, ...bad }), errorIs('INVALID_CONFIGURATION'));
  }
  assert.equal(validateOrigin('https://approved.example', 'https://approved.example'), 'https://approved.example');
  assert.throws(() => validateOrigin('https://other.example', 'https://approved.example'), errorIs('INVALID_CONFIGURATION'));
  assert.equal(f.calls.length, 0);
});

test('normal session/CSRF creates dedicated canary, posts ideas exactly once, leaves selection to Owner and logs only safe evidence', async () => {
  const f = fixture(); const result = await verifyGeminiLive(f.options);
  assert.deepEqual(result, { verified: true, status: 'LIVE', projectId, jobId, ideasCount: 10, usage: { inputTokens: 17, outputTokens: 41, totalTokens: 58 } });
  assert.equal(f.calls[0].path, '/auth/login'); assert.equal(f.calls.at(-1)?.path, '/auth/logout');
  assert.equal(f.calls.filter(call => call.path === '/projects').length, 1); assert.equal(ideasPosts(f).length, 1);
  assertNoUnsafeWrites(f);
  assert(f.events.some(event => event.status === 'LIVE')); assert(f.events.some(event => event.status === 'OWNER_SELECTION_REQUIRED'));
  const output = JSON.stringify(f.events);
  for (const privateValue of [credentials.username, credentials.password, cookie, csrf, 'PRIVATE OWNER PROJECT', ideas[0].title.en, 'Generate ten']) assert(!output.includes(privateValue));
  assert(f.events.every(event => Object.keys(event).every(key => ['status', 'projectId', 'jobId', 'ideasCount', 'usage'].includes(key))));
});

test('OpenAI/auto/mock, fallback and configured or unknown cloud lane stop before project creation', async () => {
  for (const mutation of [{ ai: { ...capabilities.ai, mode: 'openai', active: 'openai' } }, { ai: { ...capabilities.ai, mode: 'auto' } },
    { ai: { ...capabilities.ai, active: 'mock' } }, { ai: { ...capabilities.ai, fallbackReason: 'quota' } },
    { ai: { ...capabilities.ai, modeChangeLocked: true } }, { ai: { ...capabilities.ai, ideasModel: 'gemini-pro' } },
    { structuredData: { active: 'sqlite', configured: true } }, { structuredData: undefined },
    { execution: { active: 'cloud', cloudDeploymentVerified: true } }]) {
    const f = fixture({ capabilities: { ...capabilities, ...mutation } });
    await assert.rejects(verifyGeminiLive(f.options), errorIs('GEMINI_NOT_READY'));
    assert.deepEqual(f.calls.map(call => call.path), ['/auth/login', '/integrations/capabilities', '/auth/logout']);
  }
  const changed = fixture({ changedCapabilities: { ...capabilities, ai: { ...capabilities.ai, active: 'openai' } } });
  await assert.rejects(verifyGeminiLive(changed.options), errorIs('GEMINI_NOT_READY')); assert.equal(ideasPosts(changed).length, 0);
});

test('explicit canary resume returns CACHED without generation or polls existing job without POST', async () => {
  for (const resume of ['cached', 'running'] as const) {
    const f = fixture({ resume }); const result = await verifyGeminiLive({ ...f.options, projectId });
    assert.equal(result.status, resume === 'cached' ? 'CACHED' : 'LIVE'); assert.equal(result.ideasCount, 10);
    assert.equal(ideasPosts(f).length, 0); assert(!f.calls.some(call => call.path === '/projects'));
    assert.equal(f.calls.filter(call => call.method === 'POST').length, 2); assertNoUnsafeWrites(f);
  }
});

test('resume refuses Owner projects, failed/empty/multiple jobs or mismatched job identity without creating or retrying', async () => {
  for (const control of [{ resume: 'cached', projectName: 'OWNER STORY' }, { resume: 'empty' }, { resume: 'ambiguous' },
    { resume: 'failed' }, { resume: 'cached', response: (path: string) => path === '/jobs' ? json({ jobs: [{ id: jobId, projectId, projectName: canaryName, type: 'expand', status: 'running', errorCode: null }] }) : undefined }] as Control[]) {
    const f = fixture(control);
    await assert.rejects(verifyGeminiLive({ ...f.options, projectId }), errorIs(control.resume === 'failed' ? 'JOB_FAILED' : 'CANARY_STATE_UNSAFE'));
    assert.equal(ideasPosts(f).length, 0); assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
    assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assertNoUnsafeWrites(f);
  }
});

test('quota and access failures stop with whitelisted status, no raw provider errors or retry/fallback', async () => {
  for (const failedCode of ['AI_QUOTA_EXCEEDED', 'AI_RATE_LIMITED', 'AI_ACCESS_DENIED', 'AI_NOT_CONFIGURED', 'PRIVATE_PROVIDER_SECRET']) {
    const f = fixture({ failedCode });
    await assert.rejects(verifyGeminiLive(f.options), errorIs(failedCode.includes('QUOTA') || failedCode.includes('RATE') ? 'QUOTA_STOP' : failedCode.includes('ACCESS') || failedCode.includes('CONFIGURED') ? 'ACCESS_STOP' : 'JOB_FAILED'));
    assert.equal(ideasPosts(f).length, 1); assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assertNoUnsafeWrites(f);
    assert(!JSON.stringify(f.events).includes(failedCode)); assert(!f.events.some(event => event.status === 'LIVE'));
  }
  const rejected = fixture({ response: path => path.endsWith('/ideas') ? json({ error: { code: 'AI_RATE_LIMITED', detail: 'PRIVATE_PROVIDER_SECRET' } }, 429) : undefined });
  await assert.rejects(verifyGeminiLive(rejected.options), errorIs('QUOTA_STOP')); assert.equal(ideasPosts(rejected).length, 1);
});

test('only ten unique bilingual Gemini ideas and exact Lite model evidence can pass; absent usage is not invented', async () => {
  for (const completed of [{ ideas: ideas.slice(0, 9) }, { ideas: [...ideas.slice(0, 9), ideas[0]] },
    { ideas: ideas.map((idea, index) => index === 9 ? { ...idea, title: ideas[0].title } : idea) },
    { ideas: ideas.map(idea => ({ ...idea, hook: { th: 'English only', en: 'Hook' } })) },
    { generation: { ideas: 'mock' } }, { generation: { ideas: 'openai' } },
    { aiUsage: [{ ...receipt, model: 'gemini-pro' }] }, { aiUsage: [{ ...receipt, provider: 'openai' }] },
    { aiUsage: [{ ...receipt, jobId: otherJobId }] }, { aiUsage: [{ ...receipt, operation: 'expand' }] },
    { aiUsage: [receipt, receipt] }, { ideasModel: 'gemini-pro' }, { model: 'gemini-pro' },
    { ideas: ideas.map(idea => ({ ...idea, title: { th: `ข้อมูลตัวอย่าง MOCK ${idea.id}`, en: `MOCK sample data ${idea.id}` } })) }]) {
    const f = fixture({ completed });
    await assert.rejects(verifyGeminiLive(f.options), errorIs('IDEAS_INVALID'));
    assert.equal(ideasPosts(f).length, 1); assert(!f.events.some(event => event.status === 'LIVE')); assertNoUnsafeWrites(f);
  }
  const absent = fixture({ noUsage: true }); const result = await verifyGeminiLive(absent.options);
  assert.equal(result.status, 'LIVE'); assert(!('usage' in result)); assert(absent.events.every(event => !event.usage));
  const unverified = fixture({ completed: { aiUsage: [{ ...receipt, cachedInputTokens: 18 }] } });
  const unverifiedResult = await verifyGeminiLive(unverified.options);
  assert.equal(unverifiedResult.status, 'LIVE'); assert(!('usage' in unverifiedResult));
});

test('rejected login never reuses a session and response redirects, malformed/oversized bodies and HTTP errors fail closed', async () => {
  const rejected = fixture({ response: path => path === '/auth/login' ? json({ detail: credentials.password }, 401) : undefined });
  await assert.rejects(verifyGeminiLive(rejected.options), errorIs('AUTH_FAILED')); assert.equal(rejected.calls.length, 1);
  for (const response of [() => json({ detail: credentials.password }, 502), () => new Response('private malformed JSON'),
    () => new Response(null, { status: 302, headers: { Location: 'https://evil.example' } }),
    () => { const value = json({}); Object.defineProperty(value, 'redirected', { value: true }); return value; },
    () => { const value = json({}); Object.defineProperty(value, 'url', { value: 'https://evil.example' }); return value; },
    () => { throw new Error(`private ${cookie}`); }, () => new Response(new Uint8Array(1024 * 1024 + 1)),
    () => new Response('{}', { headers: { 'Content-Length': String(1024 * 1024 + 1) } })]) {
    const f = fixture({ response: path => path === '/integrations/capabilities' ? response() : undefined });
    await assert.rejects(verifyGeminiLive(f.options), (error: unknown) => {
      assert(error instanceof Error); assert(!/private|password|Bearer|session|evil/.test(error.message)); return true;
    });
    assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assert(!f.calls.some(call => call.path === '/projects'));
  }
});

test('missing, malformed or duplicate login session cookies are never reused for application requests', async () => {
  for (const cookies of [[], ['acf_session=untrusted'], [`${cookie}; Path=/`, 'acf_session=untrusted; Path=/']]) {
    const f = fixture({ response: path => {
      if (path !== '/auth/login') return undefined;
      const response = json({ csrfToken: csrf });
      for (const value of cookies) response.headers.append('Set-Cookie', value);
      return response;
    } });
    await assert.rejects(verifyGeminiLive(f.options), errorIs('INVALID_RESPONSE'));
    assert.deepEqual(f.calls.map(call => call.path), ['/auth/login']);
  }
});

test('ambiguous accepted ideas POST retains checkpoint and never retries, deletes or cancels', async () => {
  for (const control of [{ hang: `/projects/${projectId}/ideas` }, { hangBody: `/projects/${projectId}/ideas` },
    { response: (path: string) => path.endsWith('/ideas') ? new Response('private malformed response') : undefined },
    { response: (path: string) => path.endsWith('/ideas') ? json({ job: { id: jobId, projectId: otherJobId } }, 202) : undefined }] as Control[]) {
    const f = fixture(control);
    await assert.rejects(verifyGeminiLive({ ...f.options, requestTimeoutMs: 15 }), (error: unknown) => {
      assert(errorIs('IDEAS_REQUEST_AMBIGUOUS')(error));
      assert.equal((error as Error & { checkpoint: { projectId: string } }).checkpoint.projectId, projectId); return true;
    });
    assert.equal(ideasPosts(f).length, 1); assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assertNoUnsafeWrites(f);
  }
});

test('fetch/body/poll and hung injected sleep have deadlines, leave jobs intact and always attempt own logout', async () => {
  for (const control of [{ hang: '/integrations/capabilities' }, { hangBody: '/integrations/capabilities' }]) {
    const f = fixture(control);
    await assert.rejects(verifyGeminiLive({ ...f.options, requestTimeoutMs: 15 }), errorIs('REQUEST_TIMEOUT'));
    assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assert.equal(f.calls.length, 3);
  }
  const pending = fixture({ pending: true });
  await assert.rejects(verifyGeminiLive({ ...pending.options, pollTimeoutMs: 3, pollIntervalMs: 1 }), errorIs('POLL_TIMEOUT'));
  assert.equal(pending.polls, 3); assert.equal(ideasPosts(pending).length, 1); assertNoUnsafeWrites(pending);
  const hung = fixture({ pending: true });
  await assert.rejects(verifyGeminiLive({ ...hung.options, pollTimeoutMs: 15, sleep: () => new Promise(() => {}) }), errorIs('POLL_TIMEOUT'));
  assert.equal(hung.calls.at(-1)?.path, '/auth/logout');
  const logout = fixture({ response: path => path === '/auth/logout' ? json({ private: credentials.password }, 502) : undefined });
  await assert.rejects(verifyGeminiLive(logout.options), errorIs('LOGOUT_FAILED')); assert.equal(logout.calls.filter(call => call.path === '/auth/logout').length, 1);
});

test('CLI validates flags and private confirmation with zero requests, supports resume and does not print secrets', async () => {
  const f = fixture({ resume: 'cached' }); const output: string[] = [];
  const originalFetch = globalThis.fetch; const originalLog = console.log; const originalError = console.error;
  globalThis.fetch = f.options.fetchImpl; console.log = console.error = (value: string) => { output.push(value); };
  const env = { ACF_VERIFY_USERNAME: credentials.username, ACF_VERIFY_PASSWORD: credentials.password, ACF_VERIFY_GEMINI_FREE_TIER_CONFIRMED: 'true' };
  try {
    for (const argv of [['--origin', origin, '--password', credentials.password], ['--origin', origin, '--origin', origin], ['--origin'], ['--project-id', projectId]]) {
      assert.equal(await main(argv, env), 1);
    }
    assert.equal(await main(['--origin', origin], {}), 1);
    assert.equal(await main(['--origin', origin], { ...env, ACF_VERIFY_GEMINI_FREE_TIER_CONFIRMED: 'TRUE' }), 1);
    assert.equal(f.calls.length, 0);
    assert.equal(await main(['--origin', origin, '--project-id', projectId], env), 0); assert.equal(ideasPosts(f).length, 0);
    for (const privateValue of [credentials.username, credentials.password, cookie, csrf, 'PRIVATE OWNER PROJECT']) assert(!output.join(' ').includes(privateValue));
    assert(output.every(line => line.startsWith('Gemini verification: '))); assert(output.some(line => line.includes('CACHED')));
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError; }
});

test('real loopback API persists Gemini concepts/receipt with normal auth and cached resume spends no further provider request (injected only)', async t => {
  const workspace = fileURLToPath(new URL('../', import.meta.url));
  const temporaryRoot = resolve(workspace, '.tmp');
  await mkdir(temporaryRoot, { recursive: true });
  // Reject an existing .tmp symlink outside this worktree before creating the database.
  assert.equal(await realpath(temporaryRoot), join(await realpath(workspace), '.tmp'));
  const dataDir = await mkdtemp(join(temporaryRoot, 'gemini-live-integration-'));
  const server = createServer();
  const resources: { application?: ReturnType<typeof createApplication> } = {};
  t.after(async () => {
    await resources.application?.stopBackground();
    await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    await resources.application?.close();
    // Only the exact fresh test directory inside this worktree may be removed.
    assert.equal(dirname(resolve(dataDir)), temporaryRoot);
    assert(basename(dataDir).startsWith('gemini-live-integration-'));
    assert.equal(dirname(await realpath(dataDir)), await realpath(temporaryRoot));
    await rm(dataDir, { recursive: true, force: true });
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address(); assert(address && typeof address !== 'string');
  const integrationOrigin = `http://127.0.0.1:${address.port}`;
  let providerCalls = 0; let expansionCalls = 0; let modeCalls = 0;
  const provider: AiProvider = {
    async generateIdeas(input, options) {
      providerCalls++;
      assert.match(input.name, /^ACF GEMINI FREE TIER CANARY /);
      options?.onUsage?.({ provider: 'gemini', operation: 'ideas', model, inputTokens: 17, outputTokens: 41, totalTokens: 58 });
      return structuredClone(ideas);
    },
    async expandStory() { expansionCalls++; throw new Error('Expansion is outside this canary acceptance'); },
  };
  const application = createApplication({ dataDir, provider, allowedOrigins: [integrationOrigin], integrations: {
    aiStatus: () => ({ mode: 'gemini', active: 'gemini', fallbackReason: null }),
    setAiMode: () => { modeCalls++; throw new Error('Canary must never change provider mode'); },
  } });
  resources.application = application;
  const requests: Array<{ path: string; method: string }> = [];
  const logoutCookies: string[] = [];
  server.on('request', request => {
    requests.push({ path: request.url ?? '', method: request.method ?? '' });
    if (request.url === '/api/auth/logout' && request.headers.cookie) logoutCookies.push(request.headers.cookie);
  });
  server.on('request', application.app);
  const setup = await fetch(`${integrationOrigin}/api/auth/setup`, { method: 'POST', redirect: 'error', headers: {
    Origin: integrationOrigin, 'Content-Type': 'application/json',
  }, body: JSON.stringify(credentials) });
  assert.equal(setup.status, 201);
  const setupState = await setup.json() as { user: { id: string }; csrfToken: string };
  const setupCookie = setup.headers.getSetCookie().map(value => value.split(';', 1)[0]).find(value => value.startsWith('acf_session='));
  assert(setupCookie);
  const setupLogout = await fetch(`${integrationOrigin}/api/auth/logout`, { method: 'POST', redirect: 'error', headers: {
    Origin: integrationOrigin, Cookie: setupCookie, 'X-CSRF-Token': setupState.csrfToken, 'Content-Type': 'application/json',
  }, body: '{}' });
  assert.equal(setupLogout.status, 200); assert.deepEqual(await setupLogout.json(), { ok: true });
  requests.length = 0; logoutCookies.length = 0;
  const options = { origin: integrationOrigin, ...credentials, freeTierConfirmed: true, pollIntervalMs: 5, pollTimeoutMs: 5000 };
  const accepted = await verifyGeminiLive(options);
  assert.equal(accepted.status, 'LIVE'); assert.equal(accepted.ideasCount, 10); assert.equal(providerCalls, 1);
  const persisted = application.store.project(setupState.user.id, accepted.projectId);
  assert.deepEqual(persisted.ideas, ideas); assert.equal(persisted.generation?.ideas, 'gemini');
  assert.equal(persisted.selectedIdeaId, null); assert.equal(persisted.package, null);
  assert.equal(persisted.aiUsage?.length, 1);
  assert.equal(persisted.aiUsage?.[0].provider, 'gemini'); assert.equal(persisted.aiUsage?.[0].model, model);
  assert.equal(persisted.aiUsage?.[0].jobId, accepted.jobId); assert.equal(persisted.aiUsage?.[0].totalTokens, 58);
  const cached = await verifyGeminiLive({ ...options, projectId: accepted.projectId });
  assert.equal(cached.status, 'CACHED'); assert.equal(providerCalls, 1); assert.equal(cached.jobId, accepted.jobId);
  assert.deepEqual(application.store.project(setupState.user.id, accepted.projectId), persisted);
  assert.equal(expansionCalls, 0); assert.equal(modeCalls, 0);
  assert.equal(requests.filter(request => request.method === 'POST' && request.path.endsWith('/ideas')).length, 1);
  assert.equal(requests.filter(request => request.path === '/api/projects' && request.method === 'POST').length, 1);
  assert.equal(requests.filter(request => request.path === '/api/auth/login').length, 2);
  assert(!requests.some(request => /select|expand|retry|cancel|mode|cloud/.test(request.path)));
  assert.equal(logoutCookies.length, 2); assert.equal(new Set(logoutCookies).size, 2);
  for (const sessionCookie of logoutCookies) {
    const status = await fetch(`${integrationOrigin}/api/auth/status`, { redirect: 'error', headers: { Cookie: sessionCookie } });
    assert.equal(status.status, 200);
    const state = await status.json() as { user: unknown; csrfToken: unknown };
    assert.equal(state.user, null); assert.equal(state.csrfToken, null);
  }
});
