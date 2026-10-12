import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { Worker } from '../server/worker.js';
import { createMockProvider } from '../server/ai/mock.js';
import { createOpenAiProvider, AiProviderError } from '../server/ai/provider.js';
import { createConfiguredAiProvider } from '../server/ai/router.js';
import { estimateAiCost } from '../server/ai/usage.js';
import type { AiProvider, AiRequestOptions } from '../server/ai/types.js';
import { AiUsageSchema, type AiUsage } from '../shared/ai.js';

const brief = { name: 'Usage QA', brief: 'A child safely returns a lost umbrella.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' as const };
const usage: AiUsage = { provider: 'gemini', operation: 'ideas', model: 'synthetic-model', inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedInputTokens: 20, reasoningTokens: 10 };
const mock = createMockProvider();
test('OpenAI remains blocked without explicit approval even with a key or injected transport', async () => {
  let calls = 0;
  const router = createConfiguredAiProvider({ mode: 'openai', apiKey: 'synthetic-only-key', openaiApproved: false, openai: { ...mock, async generateIdeas(input) { calls++; return mock.generateIdeas(input); } } });
  assert.throws(() => router.setMode('openai'), { code: 'AI_PROVIDER_NOT_APPROVED' });
  await assert.rejects(router.provider.generateIdeas(brief), { code: 'AI_PROVIDER_NOT_APPROVED' });
  const provider = createOpenAiProvider({ apiKey: 'synthetic-only-key', requestsApproved: false, fetchImpl: async () => { calls++; return Response.json({}); } });
  await assert.rejects(provider.generateIdeas(brief), { code: 'AI_PROVIDER_NOT_APPROVED' });
  assert.equal(calls, 0);
});
async function fixture(t: TestContext, provider: AiProvider = mock) {
  await mkdir(resolve('.tmp'), { recursive: true });
  const dir = await mkdtemp(join(resolve('.tmp'), 'usage-test-'));
  const store = new Store(dir); const owner = store.createOwner('synthetic_owner', 'synthetic_hash');
  const worker = new Worker(store, provider, { aiStatus: () => ({ active: 'gemini' }) });
  t.after(async () => { await worker.stop(); store.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, store, owner, worker, project: store.createProject(owner.id, brief) };
}

test('Gemini selection is explicit, persistent and never calls OpenAI or silently falls back', async t => {
  const f = await fixture(t); let calls = 0;
  const router = createConfiguredAiProvider({ openaiApproved: true, mode: 'mock', apiKey: '', geminiApiKey: 'synthetic-only-key', stateFile: join(f.dir, 'mode.json'),
    openai: { ...mock, async generateIdeas() { throw new Error('OpenAI must not be invoked'); } },
    gemini: { ...mock, async generateIdeas(input) { calls++; return mock.generateIdeas(input); } } });
  assert.equal(router.setMode('gemini').active, 'gemini');
  assert.equal((await router.provider.generateIdeas(brief)).length, 10); assert.equal(calls, 1);
  const restarted = createConfiguredAiProvider({ openaiApproved: true, stateFile: join(f.dir, 'mode.json'), apiKey: '', geminiApiKey: 'synthetic-only-key', gemini: mock });
  assert.deepEqual(restarted.status(), { mode: 'gemini', active: 'gemini', fallbackReason: null });
  const failed = createConfiguredAiProvider({ openaiApproved: true, mode: 'gemini', apiKey: '', geminiApiKey: 'synthetic-only-key', gemini: { ...mock, async generateIdeas() { calls++; throw new AiProviderError('AI_RATE_LIMITED'); } } });
  await assert.rejects(failed.provider.generateIdeas(brief), { code: 'AI_RATE_LIMITED' });
  assert.equal(failed.status().active, 'gemini'); assert.equal(calls, 2);
  assert.throws(() => createConfiguredAiProvider({ openaiApproved: true, mode: 'mock', geminiApiKey: '' }).setMode('gemini'), { code: 'AI_NOT_CONFIGURED' });
});

test('auto remains OpenAI/Mock only and never spends Gemini credits implicitly', async () => {
  const router = createConfiguredAiProvider({ openaiApproved: true, mode: 'auto', apiKey: '', geminiApiKey: 'synthetic-only-key', gemini: { ...mock, async generateIdeas() { throw new Error('Gemini must not be invoked'); } } });
  assert.equal((await router.provider.generateIdeas(brief)).length, 10);
  assert.deepEqual(router.status(), { mode: 'auto', active: 'mock', fallbackReason: 'not_configured' });
});

test('reported usage survives invalid paid output, is deduplicated and persists without schema migration', async t => {
  let calls = 0;
  const f = await fixture(t, { ...mock, async generateIdeas(_input, options) { calls++; options?.onUsage?.(usage); options?.onUsage?.(usage); throw new AiProviderError('AI_INVALID_OUTPUT'); } });
  const job = f.store.enqueue(f.owner.id, f.project.id, 'ideas'); await f.worker.runNext();
  assert.equal(f.store.job(f.owner.id, job.id).errorCode, 'AI_INVALID_OUTPUT'); assert.equal(calls, 1);
  const receipts = f.store.project(f.owner.id, f.project.id).aiUsage!;
  assert.equal(receipts.length, 1); assert.equal(receipts[0].jobId, job.id); assert.equal(receipts[0].estimatedCostUsd, null);
  assert.equal(f.store.recordAiUsage('foreign-owner', job, usage), false);
  assert.equal(f.store.recordAiUsage(f.owner.id, job, usage), false);
  assert.throws(() => f.store.project('foreign-owner', f.project.id), { code: 'NOT_FOUND' });
  await f.worker.stop(); f.store.close(); const reopened = new Store(f.dir);
  try { assert.deepEqual(reopened.project(f.owner.id, f.project.id).aiUsage, receipts); }
  finally { reopened.close(); }
});

test('cancelled requests cannot append late usage or complete output', async t => {
  let options: AiRequestOptions | undefined; let finish!: () => void;
  const pending = new Promise<void>(yes => { finish = yes; });
  const f = await fixture(t, { ...mock, async generateIdeas(input, current) { options = current; await pending; current?.onUsage?.(usage); return mock.generateIdeas(input); } });
  const job = f.store.enqueue(f.owner.id, f.project.id, 'ideas'); const run = f.worker.runNext();
  f.worker.cancel(f.owner.id, job.id); assert.equal(options?.signal?.aborted, true);
  finish(); await run;
  assert.equal(f.store.project(f.owner.id, f.project.id).aiUsage, undefined);
  assert.equal(f.store.project(f.owner.id, f.project.id).ideas.length, 0);
});

test('usage rejects wrong job operation, unsafe metadata and duplicate forged job receipts', async t => {
  const f = await fixture(t); const job = f.store.enqueue(f.owner.id, f.project.id, 'ideas'); f.store.claim();
  assert.equal(f.store.recordAiUsage(f.owner.id, job, { ...usage, operation: 'expand' }), false);
  assert.equal(f.store.recordAiUsage(f.owner.id, { ...job, id: randomUUID() }, usage), false);
  assert.equal(AiUsageSchema.safeParse({ ...usage, totalTokens: 1 }).success, false);
  assert.equal(AiUsageSchema.safeParse({ ...usage, apiKey: 'synthetic-marker' }).success, false);
  assert.equal(f.store.recordAiUsage(f.owner.id, job, usage), true);
  assert.equal(f.store.recordAiUsage(f.owner.id, job, usage), false);
});

test('cost estimates require one verified model rate and account correctly for cached and reasoning tokens', () => {
  const rate = { provider: 'gemini', model: usage.model, inputUsdPerMillion: 2, outputUsdPerMillion: 8, cachedInputUsdPerMillion: 0.5, verifiedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(estimateAiCost(usage, JSON.stringify([rate])).estimatedCostUsd, 0.00049);
  assert.equal(estimateAiCost(usage, '').estimatedCostUsd, null);
  assert.equal(estimateAiCost(usage, JSON.stringify([{ ...rate, model: 'other-model' }])).estimatedCostUsd, null);
  assert.equal(estimateAiCost(usage, JSON.stringify([rate, rate])).estimatedCostUsd, null);
  assert.equal(estimateAiCost(usage, JSON.stringify([{ ...rate, verifiedAt: '2999-01-01T00:00:00.000Z' }])).estimatedCostUsd, null);
  const { cachedInputUsdPerMillion: _omitted, ...noCacheRate } = rate; void _omitted;
  assert.equal(estimateAiCost(usage, JSON.stringify([noCacheRate])).estimatedCostUsd, null);
});

test('OpenAI records reported usage before refusing an incomplete result and omits unreported usage', async () => {
  const receipts: AiUsage[] = []; let calls = 0;
  const provider = createOpenAiProvider({ requestsApproved: true, apiKey: 'synthetic-only-key', fetchImpl: async () => { calls++; return Response.json({ status: 'incomplete', model: 'synthetic-model', output: [], usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140, input_tokens_details: { cached_tokens: 20 }, output_tokens_details: { reasoning_tokens: 10 } } }); } });
  await assert.rejects(provider.generateIdeas(brief, { onUsage: value => receipts.push(value) }), { code: 'AI_INVALID_OUTPUT' });
  assert.equal(calls, 1); assert.deepEqual(receipts, [{ ...usage, provider: 'openai' }]);
  const noUsage = createOpenAiProvider({ requestsApproved: true, apiKey: 'synthetic-only-key', fetchImpl: async () => Response.json({ status: 'incomplete', output: [] }) });
  await assert.rejects(noUsage.generateIdeas(brief, { onUsage: value => receipts.push(value) }), { code: 'AI_INVALID_OUTPUT' });
  assert.equal(receipts.length, 1);
});
