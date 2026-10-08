import test from 'node:test';
import assert from 'node:assert/strict';
import { AiProviderError } from '../server/ai/provider.js';
import { createMockProvider } from '../server/ai/mock.js';
import { createConfiguredAiProvider } from '../server/ai/router.js';
import { validateIdeas, validateStoryPackage, type Idea, type ProjectInput, type StoryPackage } from '../shared/contracts.js';
import type { AiMode } from '../shared/integrations.js';
import type { AiProvider } from '../server/ai/types.js';

const brief: ProjectInput = {
  name: 'Rainy evening', brief: 'A child finds a lost umbrella and returns it.',
  genre: 'Drama', audience: 'General', aspectRatio: '9:16',
};
const selectedIdea: Idea = {
  id: 'idea_selected',
  title: { th: 'ร่มที่หายไป', en: 'The Missing Umbrella' },
  logline: { th: 'เด็กคนหนึ่งตามหาร่มให้เจ้าของ', en: 'A child looks for the umbrella’s owner.' },
  hook: { th: 'มีข้อความซ่อนอยู่', en: 'A hidden note changes everything.' },
};

function ideas(): Idea[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `openai_${index + 1}`,
    title: { th: `เรื่อง ${index + 1}`, en: `Story ${index + 1}` },
    logline: { th: `บทสรุป ${index + 1}`, en: `Logline ${index + 1}` },
    hook: { th: `จุดเด่น ${index + 1}`, en: `Hook ${index + 1}` },
  }));
}

function packageResult(): StoryPackage {
  return {
    storyBible: { th: 'ข้อมูลตัวอย่าง MOCK • เรื่อง', en: 'MOCK sample data • story' },
    characters: [{ id: 'character_1', name: 'MOCK • Mali', visualDescriptionEn: 'MOCK • blue jacket', background: { th: 'ข้อมูลตัวอย่าง', en: 'MOCK sample' } }],
    locations: [{ id: 'location_1', name: { th: 'ข้อมูลตัวอย่าง • สถานี', en: 'MOCK • Station' }, visualDescriptionEn: 'MOCK • quiet station', description: { th: 'ข้อมูลตัวอย่าง', en: 'MOCK sample' } }],
    continuityRules: [{ th: 'ข้อมูลตัวอย่าง • เสื้อสีน้ำเงิน', en: 'MOCK • same blue jacket' }],
    scenes: [1, 2, 3].map((order) => ({
      id: `scene_${order}`, order, title: { th: `ฉาก ${order}`, en: `Scene ${order}` }, durationSeconds: 8,
      explanationTh: `ข้อมูลตัวอย่าง • ฉาก ${order}`, flowPromptEn: `MOCK • Scene ${order} at the station.`,
      narration: { th: 'ข้อมูลตัวอย่าง', en: 'MOCK sample' }, characterIds: ['character_1'], locationId: 'location_1',
    })),
  };
}

function failingProvider(code: ConstructorParameters<typeof AiProviderError>[0], calls: { count: number }): AiProvider {
  return {
    async generateIdeas() { calls.count += 1; throw new AiProviderError(code); },
    async expandStory() { calls.count += 1; throw new AiProviderError(code); },
  };
}

test('mock returns exactly ten distinct valid bilingual ideas with visible mock labels', async () => {
  const result = await createMockProvider().generateIdeas(brief);
  assert.equal(result.length, 10);
  assert.equal(new Set(result.map((item) => item.id)).size, 10);
  assert.equal(new Set(result.map((item) => item.title.en)).size, 10);
  assert.equal(validateIdeas(result).length, 10);
  for (const item of result) {
    assert.match(item.title.th, /ข้อมูลตัวอย่าง MOCK/);
    assert.match(item.title.en, /MOCK sample data/);
    assert.match(item.logline.th, /ข้อมูลตัวอย่าง MOCK/);
    assert.match(item.logline.en, /MOCK sample data/);
    assert.match(item.hook.th, /ข้อมูลตัวอย่าง MOCK/);
    assert.match(item.hook.en, /MOCK sample data/);
  }
});

test('mock expansion validates references, durations, language fields, and labels', async () => {
  const result = await createMockProvider().expandStory(brief, selectedIdea);
  assert.equal(validateStoryPackage(result).scenes.length, 3);
  assert.match(result.storyBible.th, /ข้อมูลตัวอย่าง MOCK/);
  assert.match(result.storyBible.en, /MOCK sample data/);
  assert.equal(new Set(result.scenes.map((scene) => scene.locationId)).size, 1);
  for (const scene of result.scenes) {
    assert.match(scene.explanationTh, /ข้อมูลตัวอย่าง MOCK/);
    assert.match(scene.flowPromptEn, /MOCK sample data/);
    assert.ok(scene.characterIds.every((id) => result.characters.some((character) => character.id === id)));
    assert.ok(result.locations.some((location) => location.id === scene.locationId));
  }
});

test('mock uses no network and sanitizes/truncates arbitrary project and selected titles', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls += 1; throw new Error('network must not be used'); }) as typeof fetch;
  try {
    const provider = createMockProvider();
    const hostileBrief = { ...brief, name: `<script>alert('x')</script>${'あ'.repeat(10_000)}` };
    const hostileSelection = {
      ...selectedIdea,
      title: { th: `<img src=x onerror=alert(1)>${'ข'.repeat(10_000)}`, en: `<script>${'x'.repeat(10_000)}</script>` },
    };
    const result = await provider.expandStory(hostileBrief, hostileSelection);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /<script|<img|onerror|>/u);
    assert.ok(result.storyBible.th.length <= 8000);
    assert.ok(result.scenes.every((scene) => scene.flowPromptEn.length <= 4000));
    assert.ok(result.storyBible.th.length < 1000, 'hostile input must be truncated before it reaches generated output');
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('router projects only five brief fields and the selected idea, removing private project/idea properties', async () => {
  let capturedBrief: Record<string, unknown> | undefined;
  let capturedIdea: Record<string, unknown> | undefined;
  const openai: AiProvider = {
    async generateIdeas(input) { capturedBrief = input as unknown as Record<string, unknown>; return ideas(); },
    async expandStory(input, selection) {
      capturedBrief = input as unknown as Record<string, unknown>;
      capturedIdea = selection as unknown as Record<string, unknown>;
      return packageResult();
    },
  };
  const configured = createConfiguredAiProvider({ mode: 'openai', apiKey: 'test-key-should-not-appear', openai });
  const project = Object.assign({}, brief, {
    ideas: [{ id: 'secret_alternative', title: { en: 'SECRET_ALTERNATIVE' } }],
    selectedIdeaId: 'private_selected_id', package: { private: 'PRIVATE_PACKAGE' }, ownerId: 'PRIVATE_OWNER',
  }) as ProjectInput;
  const selectedWithExtra = Object.assign({}, selectedIdea, { alternatives: ['SECRET_ALTERNATIVE'], private: 'PRIVATE_IDEA' }) as Idea;
  await configured.provider.expandStory(project, selectedWithExtra);
  assert.deepEqual(Object.keys(capturedBrief ?? {}).sort(), ['aspectRatio', 'audience', 'brief', 'genre', 'name']);
  assert.deepEqual(Object.keys(capturedIdea ?? {}).sort(), ['hook', 'id', 'logline', 'title']);
  assert.doesNotMatch(JSON.stringify([capturedBrief, capturedIdea]), /SECRET_ALTERNATIVE|PRIVATE_PACKAGE|PRIVATE_OWNER|PRIVATE_IDEA/);
  assert.deepEqual(configured.status(), { mode: 'openai', active: 'openai', fallbackReason: null });
});

test('auto mode without an API key selects mock without attempting OpenAI', async () => {
  const calls = { count: 0 };
  const configured = createConfiguredAiProvider({ mode: 'auto', apiKey: '  ', openai: failingProvider('AI_NOT_CONFIGURED', calls) });
  assert.deepEqual(configured.status(), { mode: 'auto', active: 'mock', fallbackReason: 'not_configured' });
  assert.equal((await configured.provider.generateIdeas(brief)).length, 10);
  assert.equal(calls.count, 0);
});

test('auto mode falls back on quota/access/unconfigured once and stays on labelled mock', async () => {
  for (const [code, reason] of [
    ['AI_QUOTA_EXCEEDED', 'quota'],
    ['AI_ACCESS_DENIED', 'access'],
    ['AI_NOT_CONFIGURED', 'not_configured'],
  ] as const) {
    const calls = { count: 0 };
    const configured = createConfiguredAiProvider({ mode: 'auto', apiKey: 'test-key', openai: failingProvider(code, calls) });
    const first = await configured.provider.generateIdeas(brief);
    const second = await configured.provider.generateIdeas(brief);
    assert.equal(first.length, 10);
    assert.equal(second.length, 10);
    assert.match(first[0].title.en, /MOCK sample data/);
    assert.deepEqual(configured.status(), { mode: 'auto', active: 'mock', fallbackReason: reason });
    assert.equal(calls.count, 1, `${code} should cause at most one OpenAI attempt for this process`);
  }
});

test('auto mode does not fall back for ambiguous, refusal, invalid, timeout, or rate-limit failures', async () => {
  for (const code of ['AI_REFUSED', 'AI_INVALID_OUTPUT', 'AI_TIMEOUT', 'AI_RATE_LIMITED', 'AI_REQUEST_FAILED'] as const) {
    const calls = { count: 0 };
    const configured = createConfiguredAiProvider({ mode: 'auto', apiKey: 'test-key', openai: failingProvider(code, calls) });
    await assert.rejects(configured.provider.generateIdeas(brief), (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /test-key|secret/i);
      return true;
    });
    assert.equal(calls.count, 1);
    assert.deepEqual(configured.status(), { mode: 'auto', active: 'openai', fallbackReason: null });
  }
});

test('router redacts unexpected provider errors and attempts the provider once', async () => {
  let calls = 0;
  const openai: AiProvider = {
    async generateIdeas() { calls += 1; throw new Error('private key test-secret'); },
    async expandStory() { calls += 1; throw new Error('private key test-secret'); },
  };
  const configured = createConfiguredAiProvider({ mode: 'auto', apiKey: 'test-secret', openai });
  await assert.rejects(configured.provider.generateIdeas(brief), (error: unknown) => {
    assert.ok(error instanceof AiProviderError);
    assert.equal(error.code, 'AI_REQUEST_FAILED');
    assert.doesNotMatch(error.message, /test-secret|private/i);
    return true;
  });
  assert.equal(calls, 1);
  assert.deepEqual(configured.status(), { mode: 'auto', active: 'openai', fallbackReason: null });
});

test('explicit mock mode never calls OpenAI and reports its configured provenance', async () => {
  const calls = { count: 0 };
  const configured = createConfiguredAiProvider({ mode: 'mock', apiKey: 'test-key', openai: failingProvider('AI_REQUEST_FAILED', calls) });
  assert.deepEqual(configured.status(), { mode: 'mock', active: 'mock', fallbackReason: null });
  assert.equal((await configured.provider.generateIdeas(brief)).length, 10);
  assert.equal(calls.count, 0);
});

test('invalid runtime and environment modes fail closed without provider calls or leaking the value', () => {
  const calls = { count: 0 };
  const openai = failingProvider('AI_REQUEST_FAILED', calls);
  const previousMode = process.env.ACF_AI_MODE;
  try {
    assert.throws(
      () => createConfiguredAiProvider({ mode: 'mokk' as AiMode, openai }),
      (error: unknown) => error instanceof AiProviderError && error.code === 'AI_NOT_CONFIGURED' && !error.message.includes('mokk'),
    );
    assert.equal(calls.count, 0);

    process.env.ACF_AI_MODE = 'mokk';
    assert.throws(
      () => createConfiguredAiProvider({ openai }),
      (error: unknown) => error instanceof AiProviderError && error.code === 'AI_NOT_CONFIGURED' && !error.message.includes('mokk'),
    );
    assert.equal(calls.count, 0);
  } finally {
    if (previousMode === undefined) delete process.env.ACF_AI_MODE;
    else process.env.ACF_AI_MODE = previousMode;
  }
});
