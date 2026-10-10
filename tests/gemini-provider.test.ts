import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../server/ai/gemini.js';
import { AiProviderError } from '../server/ai/provider.js';
import { createMockProvider } from '../server/ai/mock.js';
import { ERROR_CODES, type Idea, type ProjectInput } from '../shared/contracts.js';
import type { AiUsage } from '../shared/ai.js';

interface CapturedRequest {
  store: boolean;
  systemInstruction: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  generationConfig: { candidateCount: number; maxOutputTokens: number; responseMimeType: string; responseJsonSchema: unknown };
}

const key = 'test-only-gemini-key-not-a-real-secret';
const input: ProjectInput = { name: 'Rain', brief: 'A short story about a lost umbrella.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
const selected: Idea = {
  id: 'idea_selected', title: { th: 'ร่ม', en: 'The Umbrella' },
  logline: { th: 'การเดินทาง', en: 'A journey home' }, hook: { th: 'ฝนหยุด', en: 'The rain stops' },
};
const ideas = Array.from({ length: 10 }, (_, index) => ({
  id: `idea_${index + 1}`, title: { th: `เรื่อง ${index + 1}`, en: `Story ${index + 1}` },
  logline: { th: `บทสรุป ${index + 1}`, en: `Logline ${index + 1}` },
  hook: { th: `จุดเด่น ${index + 1}`, en: `Hook ${index + 1}` },
}));
const validMetadata = { promptTokenCount: 100, candidatesTokenCount: 200, thoughtsTokenCount: 50, totalTokenCount: 350, cachedContentTokenCount: 20 };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function envelope(payload: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(payload) }] } }], ...extra };
}

function safeError(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof AiProviderError);
    assert.equal(error.code, code);
    assert.ok(ERROR_CODES.includes(error.code));
    assert.equal(error.message, code);
    assert.doesNotMatch(error.message, /test-only|sensitive|private/);
    return true;
  };
}

test('Gemini sends one fixed REST request with header key, logging disabled and the documented schema subset', async () => {
  let calls = 0;
  let captured!: CapturedRequest;
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    assert.doesNotMatch(String(url), /test-only|\?/);
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), key);
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
    assert.ok(init?.signal instanceof AbortSignal);
    captured = JSON.parse(String(init?.body)) as CapturedRequest;
    assert.doesNotMatch(String(init?.body), /test-only/);
    return jsonResponse(envelope({ ideas }));
  } });
  assert.deepEqual(await provider.generateIdeas(input), ideas);
  assert.equal(calls, 1);
  assert.equal(captured.store, false);
  assert.equal(captured.generationConfig.candidateCount, 1);
  assert.equal(captured.generationConfig.maxOutputTokens, 6000);
  assert.equal(captured.generationConfig.responseMimeType, 'application/json');
  const schema = JSON.stringify(captured.generationConfig.responseJsonSchema);
  assert.match(schema, /"minItems":10/);
  assert.match(schema, /"maxItems":10/);
  assert.match(schema, /"additionalProperties":false/);
  assert.doesNotMatch(schema, /minLength|maxLength|\$schema/);
  assert.deepEqual(Object.keys(captured).sort(), ['contents', 'generationConfig', 'store', 'systemInstruction']);
  assert.match(captured.systemInstruction.parts[0].text, /story data/);
  assert.match(captured.contents[0].parts[0].text, /exactly 10 distinct SHORT story ideas/);
});

test('Gemini expansion uses only whitelisted selected fields and preserves requested duration behavior', async () => {
  const privateInput = Object.assign({}, input, { ideas: ['PRIVATE_ALTERNATIVE'], package: 'PRIVATE_PACKAGE', csrf: 'PRIVATE_CSRF' });
  const privateSelected = Object.assign({}, selected, { private: 'PRIVATE_SELECTED', title: { ...selected.title, private: 'PRIVATE_TITLE' } });
  for (const targetDurationSeconds of [12, 61, 180]) {
    let captured!: CapturedRequest;
    const requested = { ...privateInput, targetDurationSeconds };
    const story = await createMockProvider().expandStory({ ...input, targetDurationSeconds: targetDurationSeconds === 61 ? 60 : targetDurationSeconds }, selected);
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async (url, init) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
      captured = JSON.parse(String(init?.body)) as CapturedRequest;
      return jsonResponse(envelope(story));
    } });
    assert.deepEqual(await provider.expandStory(requested, privateSelected), story);
    const prompt = captured.contents[0].parts[0].text;
    assert.match(prompt, /ONLY the single selected idea/);
    assert.match(prompt, /idea_selected/);
    assert.match(prompt, /The Umbrella/);
    assert.match(prompt, new RegExp(`Target a total story duration of ${targetDurationSeconds} seconds`));
    assert.match(prompt, /explanation in Thai/);
    assert.match(prompt, /English Google Flow prompt/);
    assert.doesNotMatch(prompt, /PRIVATE_ALTERNATIVE|PRIVATE_PACKAGE|PRIVATE_CSRF|PRIVATE_SELECTED|PRIVATE_TITLE/);
    assert.equal(captured.generationConfig.maxOutputTokens, 12000);
  }
});

test('Gemini validates configuration, model paths and outgoing inputs before making a paid request', async () => {
  const configurations = [
    { apiKey: '' }, { ideasModel: '../../evil' }, { ideasModel: 'gemini-good?key=evil' },
    { ideasModel: 'https://private.test' }, { ideasModel: 'gemini-' },
    { ideasModel: `gemini-${'a'.repeat(101)}` }, { timeoutMs: 0 }, { timeoutMs: 120_001 }, { timeoutMs: 0.5 },
  ];
  for (const configuration of configurations) {
    let calls = 0;
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, ...configuration, fetch: async () => { calls += 1; return jsonResponse(envelope({ ideas })); } });
    await assert.rejects(provider.generateIdeas(input), safeError('AI_NOT_CONFIGURED'));
    assert.equal(calls, 0);
  }
  let calls = 0;
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => { calls += 1; return jsonResponse(envelope({ ideas })); } });
  await assert.rejects(provider.generateIdeas({ ...input, brief: 'short' }), safeError('INVALID_INPUT'));
  await assert.rejects(provider.expandStory(input, { ...selected, title: { th: '', en: 'Umbrella' } }), safeError('INVALID_INPUT'));
  assert.equal(calls, 0);
});

test('Gemini requires explicit Free Tier confirmation and blocks every model outside the Flash-Lite allowlist', async () => {
  const previousConfirmation = process.env.ACF_GEMINI_FREE_TIER_CONFIRMED;
  delete process.env.ACF_GEMINI_FREE_TIER_CONFIRMED;
  let calls = 0;
  const requestFetch: typeof fetch = async () => { calls += 1; return jsonResponse(envelope({ ideas })); };
  try {
    for (const freeTierConfirmed of [undefined, false]) {
      const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed, fetch: requestFetch });
      await assert.rejects(provider.generateIdeas(input), safeError('AI_NOT_CONFIGURED'));
      await assert.rejects(provider.expandStory(input, selected), safeError('AI_NOT_CONFIGURED'));
    }
    for (const model of ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.5-flash-lite-preview', 'gemini-3.5-flash-lite-image', 'gemini-2.5-flash-lite']) {
      const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, ideasModel: model, expansionModel: model, fetch: requestFetch });
      await assert.rejects(provider.generateIdeas(input), safeError('AI_NOT_CONFIGURED'));
      await assert.rejects(provider.expandStory(input, selected), safeError('AI_NOT_CONFIGURED'));
    }
    assert.equal(calls, 0);
    process.env.ACF_GEMINI_FREE_TIER_CONFIRMED = 'true';
    const disabled = createGeminiProvider({ apiKey: key, freeTierConfirmed: false, fetch: requestFetch });
    await assert.rejects(disabled.generateIdeas(input), safeError('AI_NOT_CONFIGURED'));
    assert.equal(calls, 0);
    const confirmed = createGeminiProvider({ apiKey: key, fetch: requestFetch });
    assert.deepEqual(await confirmed.generateIdeas(input), ideas);
    assert.equal(calls, 1);
  } finally {
    if (previousConfirmation === undefined) delete process.env.ACF_GEMINI_FREE_TIER_CONFIRMED;
    else process.env.ACF_GEMINI_FREE_TIER_CONFIRMED = previousConfirmation;
  }
});

test('Gemini stops after one quota response without retry or model fallback', async () => {
  let calls = 0;
  const provider = createGeminiProvider({ apiKey: key, freeTierConfirmed: true, fetch: async (url) => {
    calls += 1;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    return jsonResponse({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', domain: 'googleapis.com', reason: 'QUOTA_EXCEEDED' }] } }, 429);
  } });
  await assert.rejects(provider.generateIdeas(input), safeError('AI_QUOTA_EXCEEDED'));
  assert.equal(calls, 1);
});

test('Gemini retains complete local Zod and semantic validation after reducing the remote schema', async () => {
  const badIdeas: unknown[] = [
    { ideas: ideas.slice(0, 9) }, { ideas: [...ideas, ideas[0]] },
    { ideas: ideas.map(() => ideas[0]) },
    { ideas: [{ ...ideas[0], title: { th: '', en: 'Empty Thai' } }, ...ideas.slice(1)] },
    { ideas: [{ ...ideas[0], logline: { th: 'ยาว', en: 'x'.repeat(8001) } }, ...ideas.slice(1)] },
    { ideas, private: 'extra field' },
  ];
  for (const payload of badIdeas) {
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(envelope(payload)) });
    await assert.rejects(provider.generateIdeas(input), safeError('AI_INVALID_OUTPUT'));
  }
  const story = await createMockProvider().expandStory(input, selected);
  const badStories = [
    { ...story, scenes: story.scenes.slice(0, 2) },
    { ...story, scenes: story.scenes.map(scene => ({ ...scene, locationId: 'unknown_location' })) },
    { ...story, scenes: story.scenes.map(scene => ({ ...scene, characterIds: ['unknown_character'] })) },
    { ...story, scenes: story.scenes.map(scene => ({ ...scene, order: 2 })) },
    { ...story, scenes: story.scenes.map(scene => ({ ...scene, durationSeconds: 21 })) },
    { ...story, scenes: story.scenes.map(scene => ({ ...scene, durationSeconds: 3 })) },
    { ...story, scenes: Array.from({ length: 10 }, (_, index) => ({ ...story.scenes[0], id: `scene_${index}`, order: index + 1, durationSeconds: 20 })) },
  ];
  for (const payload of badStories) {
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(envelope(payload)) });
    await assert.rejects(provider.expandStory(input, selected), safeError('AI_INVALID_OUTPUT'));
  }
});

test('Gemini excludes thought parts while concatenating text parts from the single completed candidate', async () => {
  const text = JSON.stringify({ ideas });
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse({ candidates: [{
    finishReason: 'STOP', content: { role: 'model', parts: [
      { text: 'PRIVATE_THOUGHT_NOT_JSON', thought: true, thoughtSignature: 'opaque-signature' },
      { text: text.slice(0, 20), thought: false }, { text: text.slice(20), thoughtSignature: 'opaque-signature' },
    ] },
  }] }) });
  assert.deepEqual(await provider.generateIdeas(input), ideas);
});

test('Gemini rejects ambiguous, incomplete, non-text and malformed candidates without retrying', async () => {
  const candidate = { finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify({ ideas }) }] } };
  const bodies = [
    {}, { candidates: [] }, { candidates: [candidate, candidate] }, { candidates: [{ ...candidate, index: 1 }] },
    { candidates: [{ ...candidate, finishReason: 'MAX_TOKENS' }] }, { candidates: [{ ...candidate, finishReason: 'OTHER' }] },
    { candidates: [{ content: candidate.content }] }, { candidates: [{ finishReason: 'STOP' }] },
    { candidates: [{ ...candidate, content: { parts: [{ text: JSON.stringify({ ideas }), thought: 'false' }] } }] },
    { candidates: [{ ...candidate, content: { parts: [{ text: 'only thought', thought: true }] } }] },
    { candidates: [{ ...candidate, content: { parts: [{ functionCall: { name: 'private_tool' } }] } }] },
    { candidates: [{ ...candidate, content: { parts: [{ text: JSON.stringify({ ideas }), inlineData: { data: 'private_image' } }] } }] },
    { candidates: [{ ...candidate, content: { parts: [{ text: '```json\n{}\n```' }] } }] },
  ];
  for (const body of bodies) {
    let calls = 0;
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => { calls += 1; return jsonResponse(body); } });
    await assert.rejects(provider.generateIdeas(input), safeError('AI_INVALID_OUTPUT'));
    assert.equal(calls, 1);
  }
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => new Response('sensitive malformed json', { status: 200 }) });
  await assert.rejects(provider.generateIdeas(input), safeError('AI_INVALID_OUTPUT'));
});

test('Gemini maps prompt and candidate policy blocks to the safe refusal code', async () => {
  const bodies = [
    { promptFeedback: { blockReason: 'SAFETY' } },
    { candidates: [{ finishReason: 'SAFETY' }] }, { candidates: [{ finishReason: 'RECITATION' }] },
    { candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] }, { candidates: [{ finishReason: 'SPII' }] },
    { candidates: [{ finishReason: 'STOP', safetyRatings: [{ blocked: true }] }] },
  ];
  for (const body of bodies) {
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(body) });
    await assert.rejects(provider.generateIdeas(input), safeError('AI_REFUSED'));
  }
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(envelope({ ideas }, { promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' } })) });
  assert.deepEqual(await provider.generateIdeas(input), ideas);
});

test('Gemini maps safe HTTP errors and distinguishes reliable quota reasons from generic 429 responses', async () => {
  const detail = (reason: string, domain = 'googleapis.com') => ({ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain });
  const cases: Array<[number, unknown, string]> = [
    [429, { error: { status: 'RESOURCE_EXHAUSTED', message: 'private quota exceeded' } }, 'AI_RATE_LIMITED'],
    [429, { error: { details: [detail('RATE_LIMIT_EXCEEDED')] } }, 'AI_RATE_LIMITED'],
    [429, { error: { details: [detail('QUOTA_EXCEEDED')] } }, 'AI_QUOTA_EXCEEDED'],
    [429, { error: { details: [detail('QUOTA_EXCEEDED', 'private.test')] } }, 'AI_RATE_LIMITED'],
    [429, { error: { details: [{ reason: 'QUOTA_EXCEEDED' }] } }, 'AI_RATE_LIMITED'],
    [429, { error: { details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ description: 'quota private' }] }] } }, 'AI_RATE_LIMITED'],
    [400, { error: { details: [detail('API_KEY_INVALID')] } }, 'AI_ACCESS_DENIED'],
    [400, { error: { message: 'API_KEY_INVALID private' } }, 'AI_REQUEST_FAILED'],
    [401, {}, 'AI_ACCESS_DENIED'], [403, {}, 'AI_ACCESS_DENIED'], [402, {}, 'AI_QUOTA_EXCEEDED'],
    [408, {}, 'AI_TIMEOUT'], [499, {}, 'AI_TIMEOUT'], [504, {}, 'AI_TIMEOUT'],
    [500, { error: { message: key } }, 'AI_REQUEST_FAILED'], [302, {}, 'AI_REQUEST_FAILED'],
  ];
  for (const [status, body, expected] of cases) {
    let calls = 0;
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => { calls += 1; return jsonResponse(body, status); } });
    await assert.rejects(provider.generateIdeas(input), safeError(expected));
    assert.equal(calls, 1);
  }
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => new Response('private malformed error body', { status: 429 }) });
  await assert.rejects(provider.generateIdeas(input), safeError('AI_RATE_LIMITED'));
});

test('Gemini reports normalized reliable usage including reasoning before validating paid output', async () => {
  const usage: AiUsage[] = [];
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, ideasModel: 'gemini-3.5-flash-lite', expansionModel: 'gemini-3.5-flash-lite', fetch: async () => jsonResponse(envelope({ ideas: [] }, { usageMetadata: validMetadata })) });
  await assert.rejects(provider.generateIdeas(input, { onUsage: receipt => usage.push(receipt) }), safeError('AI_INVALID_OUTPUT'));
  assert.deepEqual(usage, [{ provider: 'gemini', operation: 'ideas', model: 'gemini-3.5-flash-lite', inputTokens: 100, outputTokens: 250, totalTokens: 350, cachedInputTokens: 20, reasoningTokens: 50 }]);
  await assert.rejects(provider.expandStory(input, selected, { onUsage: receipt => usage.push(receipt) }), safeError('AI_INVALID_OUTPUT'));
  assert.equal(usage[1].operation, 'expand');
  assert.equal(usage[1].model, 'gemini-3.5-flash-lite');
  const blocked = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: validMetadata }) });
  await assert.rejects(blocked.generateIdeas(input, { onUsage: receipt => usage.push(receipt) }), safeError('AI_REFUSED'));
  assert.equal(usage.length, 3);
});

test('Gemini omits unreported optional usage fields and discards unreliable metadata', async () => {
  const usage: AiUsage[] = [];
  const metadata = { promptTokenCount: 100, candidatesTokenCount: 200, totalTokenCount: 300 };
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(envelope({ ideas }, { usageMetadata: metadata })) });
  await provider.generateIdeas(input, { onUsage: receipt => usage.push(receipt) });
  assert.deepEqual(usage, [{ provider: 'gemini', operation: 'ideas', model: 'gemini-3.5-flash-lite', inputTokens: 100, outputTokens: 200, totalTokens: 300 }]);
  const badMetadata = [
    undefined, {}, { ...metadata, promptTokenCount: '100' }, { ...metadata, candidatesTokenCount: -1 },
    { ...metadata, totalTokenCount: 299 }, { ...metadata, totalTokenCount: 350 },
    { ...metadata, thoughtsTokenCount: 50 }, { ...metadata, cachedContentTokenCount: 101 },
    { ...metadata, candidatesTokenCount: 1.5 }, { ...metadata, promptTokenCount: Number.MAX_SAFE_INTEGER + 1 },
    { ...metadata, thoughtsTokenCount: null }, { promptTokenCount: 100, totalTokenCount: 300 },
  ];
  for (const usageMetadata of badMetadata) {
    const invalid = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => jsonResponse(envelope({ ideas }, { usageMetadata })) });
    assert.deepEqual(await invalid.generateIdeas(input, { onUsage: receipt => usage.push(receipt) }), ideas);
    assert.equal(usage.length, 1);
  }
});

test('Gemini times out stalled fetch and body reads, including mocks that ignore AbortSignal', async () => {
  for (const stallBody of [false, true]) {
    let calls = 0;
    let signal!: AbortSignal;
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, timeoutMs: 10, fetch: async (_url, init) => {
      calls += 1;
      signal = init?.signal as AbortSignal;
      if (!stallBody) return new Promise<Response>(() => {});
      const response = jsonResponse(envelope({ ideas }));
      Object.defineProperty(response, 'json', { value: () => new Promise<unknown>(() => {}) });
      return response;
    } });
    await assert.rejects(provider.generateIdeas(input), safeError('AI_TIMEOUT'));
    assert.equal(calls, 1);
    assert.equal(signal.aborted, true);
  }
});

test('Gemini supports pre-abort and mid-request cancellation without duplicate requests or late usage', async () => {
  let calls = 0;
  const pre = new AbortController();
  pre.abort();
  const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => { calls += 1; return jsonResponse(envelope({ ideas })); } });
  await assert.rejects(provider.generateIdeas(input, { signal: pre.signal }), safeError('AI_TIMEOUT'));
  assert.equal(calls, 0);
  const controller = new AbortController();
  let resolveFetch!: (response: Response) => void;
  const usage: AiUsage[] = [];
  const pending = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => {
    calls += 1;
    return new Promise<Response>(resolve => { resolveFetch = resolve; });
  } }).generateIdeas(input, { signal: controller.signal, onUsage: receipt => usage.push(receipt) });
  assert.equal(calls, 1);
  controller.abort();
  await assert.rejects(pending, safeError('AI_TIMEOUT'));
  resolveFetch(jsonResponse(envelope({ ideas }, { usageMetadata: validMetadata })));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(usage.length, 0);
});

test('Gemini maps network and fetch abort errors safely and never retries', async () => {
  for (const [name, expected] of [['Error', 'AI_REQUEST_FAILED'], ['AbortError', 'AI_TIMEOUT'], ['TimeoutError', 'AI_TIMEOUT']]) {
    let calls = 0;
    const provider = createGeminiProvider({ freeTierConfirmed: true, apiKey: key, fetch: async () => {
      calls += 1;
      const error = new Error(`private ${key}`);
      error.name = name;
      throw error;
    } });
    await assert.rejects(provider.generateIdeas(input), safeError(expected));
    assert.equal(calls, 1);
  }
});
