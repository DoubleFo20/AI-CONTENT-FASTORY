import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiProvider, AiProviderError } from '../server/ai/provider.js';
import { ERROR_CODES, type Idea, type ProjectInput, type StoryPackage } from '../shared/contracts.js';

interface CapturedRequest {
  store: boolean;
  input: Array<{ role: string; content: string }>;
  text: { format: { strict: boolean; schema: unknown } };
}

const input: ProjectInput = { name: 'Rain', brief: 'A short story about a lost umbrella.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
const selected: Idea = {
  id: 'idea_selected',
  title: { th: 'ร่ม', en: 'The Umbrella' },
  logline: { th: 'การเดินทาง', en: 'A journey home' },
  hook: { th: 'ฝนหยุด', en: 'The rain stops' },
};
const outputIdeas: Idea[] = Array.from({ length: 10 }, (_, index) => ({
  id: `idea_${index + 1}`,
  title: { th: `เรื่อง ${index + 1}`, en: `Story ${index + 1}` },
  logline: { th: `บทสรุป ${index + 1}`, en: `Logline ${index + 1}` },
  hook: { th: `จุดเด่น ${index + 1}`, en: `Hook ${index + 1}` },
}));
const outputStory: StoryPackage = {
  storyBible: { th: 'เรื่อง', en: 'Story' },
  characters: [{ id: 'character_1', name: 'Mali', visualDescriptionEn: 'Blue jacket', background: { th: 'พื้นหลัง', en: 'Background' } }],
  locations: [{ id: 'location_1', name: { th: 'สวน', en: 'Garden' }, visualDescriptionEn: 'Quiet garden', description: { th: 'สถานที่', en: 'Place' } }],
  continuityRules: [{ th: 'เสื้อสีน้ำเงิน', en: 'Blue jacket' }],
  scenes: [1, 2, 3].map((order) => ({
    id: `scene_${order}`, order, title: { th: `ฉาก ${order}`, en: `Scene ${order}` }, durationSeconds: 20,
    explanationTh: `คำอธิบาย ${order}`, flowPromptEn: `Mali in the garden, shot ${order}`,
    narration: { th: 'คำบรรยาย', en: 'Narration' }, characterIds: ['character_1'], locationId: 'location_1',
  })),
};

function response(payload: unknown, status = 'completed'): Response {
  return new Response(JSON.stringify({ status, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }), { status: 200 });
}

test('ideas request declares strict JSON schema with exactly ten entries and makes one request', async () => {
  let calls = 0;
  let requestBody!: CapturedRequest;
  const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'test-only-key-not-a-real-secret', fetchImpl: async (_url, init) => {
    calls += 1;
    requestBody = JSON.parse(String(init?.body)) as CapturedRequest;
    return response({ ideas: outputIdeas });
  } });
  assert.equal((await provider.generateIdeas(input)).length, 10);
  assert.equal(calls, 1);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.text.format.strict, true);
  assert.match(JSON.stringify(requestBody.text.format.schema), /"minItems":10/);
  assert.match(JSON.stringify(requestBody.text.format.schema), /"maxItems":10/);
});

test('expansion prompt contains the selected idea alone and validates its package', async () => {
  let requestBody!: CapturedRequest;
  const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'test-only-key-not-a-real-secret', fetchImpl: async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as CapturedRequest;
    return response(outputStory);
  } });
  const result = await provider.expandStory(input, selected);
  assert.equal(result.scenes.length, 3);
  const prompt = requestBody.input[1].content;
  assert.match(prompt, /The Umbrella/);
  assert.match(prompt, /idea_selected/);
  assert.doesNotMatch(prompt, /"id":"idea_2"/);
  assert.equal(requestBody.store, false);
});

test('provider strips project state and alternative ideas from the outgoing brief prompt', async () => {
  let requestBody!: CapturedRequest;
  const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'test-only-key-not-a-real-secret', fetchImpl: async (_url, init) => {
    requestBody = JSON.parse(String(init?.body)) as CapturedRequest;
    return response(outputStory);
  } });
  const privateProjectState = Object.assign({}, input, {
    ideas: [{ id: 'alternative_secret_marker', title: { en: 'SECRET_ALTERNATIVE' } }],
    selectedIdeaId: 'selected_secret_marker',
    package: { secret: 'PRIVATE_PACKAGE_MARKER' },
  }) as ProjectInput;
  await provider.expandStory(privateProjectState, selected);
  const prompt = requestBody.input[1].content as string;
  assert.match(prompt, /The Umbrella/);
  assert.doesNotMatch(prompt, /alternative_secret_marker|SECRET_ALTERNATIVE|selected_secret_marker|PRIVATE_PACKAGE_MARKER/);
});

test('provider failures are mapped to safe codes without retries or leaked details', async () => {
  for (const [label, fetchImpl, expected] of [
    ['refusal', async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', text: 'secret refusal detail' }] }] }), { status: 200 }), 'AI_REFUSED'],
    ['incomplete', async () => response({}, 'incomplete'), 'AI_INVALID_OUTPUT'],
    ['invalid output', async () => response({ ideas: [] }), 'AI_INVALID_OUTPUT'],
    ['http error', async () => new Response('sensitive provider body', { status: 500 }), 'AI_REQUEST_FAILED'],
    ['timeout', async () => { const error = new Error('private timeout'); error.name = 'TimeoutError'; throw error; }, 'AI_TIMEOUT'],
    ['network error', async () => { throw new Error('test-only-key-not-a-real-secret network detail'); }, 'AI_REQUEST_FAILED'],
  ] as const) {
    let calls = 0;
    const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'test-only-key-not-a-real-secret', fetchImpl: async () => { calls += 1; return fetchImpl(); } });
    await assert.rejects(provider.generateIdeas(input), (error: unknown) => {
      assert.ok(error instanceof AiProviderError, label);
      assert.equal(error.code, expected, label);
      assert.doesNotMatch(error.message, /secret|private|sensitive|test-only-key/);
      return true;
    });
    assert.equal(calls, 1, `${label} must not retry`);
  }
});

test('provider maps quota, rate-limit, and access failures to known localized error codes', async () => {
  const responses: Array<[string, number, unknown, string]> = [
    ['quota', 429, { error: { type: 'insufficient_quota', message: 'private billing detail' } }, 'AI_QUOTA_EXCEEDED'],
    ['rate limit', 429, { error: { type: 'rate_limit_exceeded', message: 'private limit detail' } }, 'AI_RATE_LIMITED'],
    ['access denied', 403, { error: { message: 'private key detail' } }, 'AI_ACCESS_DENIED'],
    ['unauthorized', 401, { error: { message: 'private key detail' } }, 'AI_ACCESS_DENIED'],
  ];
  for (const [label, status, body, expected] of responses) {
    let calls = 0;
    const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'test-only-key-not-a-real-secret', fetchImpl: async () => {
      calls += 1;
      return new Response(JSON.stringify(body), { status });
    } });
    await assert.rejects(provider.generateIdeas(input), (error: unknown) => {
      assert.ok(error instanceof AiProviderError, label);
      assert.equal(error.code, expected, label);
      assert.ok(ERROR_CODES.includes(error.code), `${error.code} must be declared in shared error codes`);
      assert.doesNotMatch(error.message, /private|test-only-key/);
      return true;
    });
    assert.equal(calls, 1, `${label} must not retry`);
  }
});

test('every AI provider error code is declared in the shared API error catalog', () => {
  for (const code of [
    'AI_NOT_CONFIGURED', 'AI_REQUEST_FAILED', 'AI_INVALID_OUTPUT', 'AI_REFUSED',
    'AI_TIMEOUT', 'AI_QUOTA_EXCEEDED', 'AI_RATE_LIMITED', 'AI_ACCESS_DENIED',
  ] as const) assert.ok(ERROR_CODES.includes(code), `${code} is missing from ERROR_CODES`);
});
