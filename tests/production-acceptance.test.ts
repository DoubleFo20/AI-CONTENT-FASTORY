import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createMockProvider } from '../server/ai/mock.js';
import { flowPrompt, matchClip } from '../server/project-files.js';
import type { Project } from '../shared/contracts.js';
import { EditorSettingsSchema, FlowSettingsSchema, type ProductionState } from '../shared/production.js';

// Dynamic URL avoids needing a new declaration/config file for the .mjs CLI.
const scriptUrl = new URL('../scripts/prepare-production-acceptance.mjs', import.meta.url);
const { buildProductionAcceptance, prepareProductionAcceptance } = await import(scriptUrl.href);
const run = promisify(execFile);

async function snapshot(duration = 20) {
  const mock = createMockProvider();
  const brief = { name: 'Synthetic acceptance story', brief: 'A synthetic short story for offline handoff tests.', genre: 'Warm', audience: 'All', aspectRatio: '9:16' as const, targetDurationSeconds: duration };
  const ideas = await mock.generateIdeas(brief);
  const project: Project = {
    ...brief, id: randomUUID(), status: 'expanded', createdAt: '2026-10-12T00:00:00Z', updatedAt: '2026-10-12T00:00:00Z',
    ideas, selectedIdeaId: ideas[4].id, package: await mock.expandStory(brief, ideas[4]), clips: [], export: null,
    generation: { ideas: 'mock', expansion: 'mock' },
  };
  const productionState: ProductionState = { flow: FlowSettingsSchema.parse({}), editor: EditorSettingsSchema.parse({}), scenes: {}, audio: [], images: [] };
  return { project, productionState, clipProvenance: {} as Record<string, 'REAL_FLOW_OWNER_DECLARED' | 'SYNTHETIC_MEDIA' | 'UNKNOWN'> };
}

async function fixture(t: TestContext) {
  const temporaryRoot = resolve('.tmp'); await mkdir(temporaryRoot, { recursive: true });
  const workspace = await mkdtemp(join(temporaryRoot, 'acceptance-test-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const inputPath = join(workspace, 'private-input.json');
  const input = await snapshot();
  await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
  const outputDir = join(workspace, '.tmp', 'production-acceptance', 'first');
  return { workspace, inputPath, outputDir, input };
}

test('offline bundle is deterministic, uses canonical prompts, and keeps variable scene durations and a single selected story', async t => {
  const f = await fixture(t);
  const bundle = buildProductionAcceptance(f.input);
  assert.deepEqual(buildProductionAcceptance(f.input), bundle);
  assert.equal(bundle.project.selectedIdea.id, f.input.project.selectedIdeaId);
  assert.equal(bundle.project.targetDurationSeconds, 20);
  assert.equal(bundle.scenes.length, 3);
  assert.deepEqual(bundle.scenes.map((scene: { durationSeconds: number }) => scene.durationSeconds), [7, 7, 6]);
  assert.equal(bundle.scenes[0].promptEn, flowPrompt(f.input.project, f.input.project.package!.scenes[0], f.input.productionState));
  assert.deepEqual(bundle.scenes.map((scene: { filename: string }) => scene.filename), ['mock_scene_1.mp4', 'mock_scene_2.mp4', 'mock_scene_3.mp4']);
  assert.equal(bundle.provenance.text, 'MOCK_ONLY');
  assert.equal(bundle.provenance.mediaFilesVerified, false);
  assert.equal(bundle.creditEstimate.estimatedCredits, null);
  assert.equal(bundle.creditEstimate.spendsCredits, false);
  const summary = prepareProductionAcceptance(f);
  assert.equal(summary.missingClipCount, 3);
  assert.deepEqual(JSON.parse(await readFile(join(f.outputDir, 'manifest.json'), 'utf8')), bundle);
  const handoff = await readFile(join(f.outputDir, 'OWNER_HANDOFF_TH.md'), 'utf8');
  assert.match(handoff, /narrative/); assert.match(handoff, /editorial/); assert.match(handoff, /automatic retry/);
  assert.match(handoff, /music/); assert.match(handoff, /SFX/); assert.match(handoff, /MP4/);
  assert.doesNotMatch(handoff, /scene_N\.mp4/); assert.match(handoff, /mock_scene_1\.mp4/);
  assert.equal(await readFile(join(f.outputDir, 'scenes', 'scene_1.txt'), 'utf8'), `${bundle.scenes[0].promptEn}\n`);
  assert.deepEqual((await readdir(f.outputDir)).sort(), ['OWNER_HANDOFF_TH.md', 'manifest.json', 'scenes']);
  if (process.platform !== 'win32') {
    assert.equal((await stat(f.outputDir)).mode & 0o777, 0o700);
    assert.equal((await stat(join(f.outputDir, 'manifest.json'))).mode & 0o777, 0o600);
  }
  assert.equal(bundle.permissions.inheritedWindowsAcl, 'NOT_VERIFIED_BY_CLI');
});

test('manifest clip filenames preserve canonical scene IDs and automatically match Mock, custom and cached-style scene IDs', async () => {
  for (const ids of [['mock_scene_1', 'mock_scene_2', 'mock_scene_3'], ['opening_hook', 'rescue-turn', 'closing_resolution'], ['scene_1', 'scene_2', 'scene_3'], ['s01', 's02', 's03']]) {
    const input = await snapshot();
    input.project.package!.scenes.forEach((scene, index) => { scene.id = ids[index]; });
    const bundle = buildProductionAcceptance(input);
    for (const scene of bundle.scenes as Array<{ sceneId: string; filename: string; promptEn: string }>) {
      assert.equal(scene.filename, `${scene.sceneId}.mp4`);
      assert.equal(matchClip(input.project, scene.filename), scene.sceneId);
      assert.ok(scene.promptEn.includes(`Save the completed clip as ${scene.filename}.`));
      assert.equal(bundle.missingClips.find((clip: { sceneId: string }) => clip.sceneId === scene.sceneId)?.filename, scene.filename);
    }
  }
  for (const reserved of ['CON', 'prn', 'aux', 'nul', 'COM1', 'lpt9']) {
    const input = await snapshot(); input.project.package!.scenes[0].id = reserved;
    assert.throws(() => buildProductionAcceptance(input), /UNSAFE_SCENE_OR_REFERENCE_ID/);
  }
});

test('text provider labels and synthetic/unknown clip metadata never claim live-video verification or reduce missing real clips', async () => {
  const input = await snapshot();
  input.project.generation = { ideas: 'gemini', expansion: 'gemini' };
  const clipId = randomUUID();
  input.project.clips = [{ id: clipId, projectId: input.project.id, sceneId: input.project.package!.scenes[0].id, durationSeconds: 7, originalName: 'private-original.mp4', createdAt: '' }];
  input.clipProvenance[clipId] = 'SYNTHETIC_MEDIA';
  input.productionState.flow = FlowSettingsSchema.parse({ creditsPerGeneration: 20, generationDurationSeconds: 4, rateVerifiedByOwner: true, budgetCredits: 100 });
  let bundle = buildProductionAcceptance(input);
  assert.equal(bundle.provenance.text, 'REAL_TEXT'); assert.equal(bundle.provenance.textEvidence, 'SNAPSHOT_PROVIDER_METADATA_ONLY');
  assert.equal(bundle.provenance.media, 'SYNTHETIC_MEDIA'); assert.equal(bundle.provenance.liveCallsThisRun, 0);
  assert.equal(bundle.missingClips.length, 3); assert.equal(bundle.creditEstimate.estimatedCredits, 120);
  assert.equal(bundle.creditEstimate.withinBudget, false); assert.equal(bundle.snapshotCreditEstimate.estimatedCredits, 80);
  input.clipProvenance[clipId] = 'REAL_FLOW_OWNER_DECLARED'; bundle = buildProductionAcceptance(input);
  assert.equal(bundle.missingClips.length, 2); assert.equal(bundle.scenes[0].clip.fileVerified, false);
  assert.equal(bundle.review.videoAcceptance, 'NOT_VERIFIED');
  input.productionState.flow.rateVerifiedByOwner = false;
  assert.equal(buildProductionAcceptance(input).creditEstimate.estimatedCredits, null);
  input.clipProvenance = {}; assert.equal(buildProductionAcceptance(input).scenes[0].clip.provenance, 'UNKNOWN');
});

test('only explicit output fields survive snapshots containing private account, receipt, auth and managed metadata', async () => {
  const input = await snapshot();
  Object.assign(input.project, { aiUsage: [{ model: 'secret-receipt', jobId: 'private-job' }], account: 'private-account', apiKey: 'ignored-private-key', ownerId: 'private-owner', csrfToken: 'private-csrf' });
  Object.assign(input.productionState, { ownerId: 'private-owner', filename: 'private-managed-file', personalAccount: 'private-account' });
  const audioId = randomUUID(); const imageId = randomUUID();
  input.productionState.audio = [{ id: audioId, projectId: input.project.id, originalName: 'private-audio-name', durationSeconds: 4, createdAt: '' }];
  input.productionState.images = [{ id: imageId, projectId: input.project.id, originalName: 'private-image-name', width: 120, height: 120, createdAt: '' }];
  input.productionState.editor.musicAssetId = audioId;
  const output = JSON.stringify(buildProductionAcceptance(input));
  assert.doesNotMatch(output, /private-(?:account|owner|csrf|key|job|managed|audio-name|image-name)|secret-receipt|aiUsage|apiKey|csrfToken|ownerId|originalName/);
  input.project.package!.scenes[0].flowPromptEn = 'Bearer synthetic-secret-in-allowlisted-story-field';
  assert.throws(() => buildProductionAcceptance(input), /PRIVATE_CONTENT_REJECTED/);
});

test('acceptance rejects invalid selection, ten-idea invariant, durations, unsafe IDs and production references', async () => {
  const baseline = await snapshot();
  const invalid: Array<(input: Awaited<ReturnType<typeof snapshot>>) => void> = [
    input => { input.project.ideas.pop(); },
    input => { input.project.ideas[1].id = input.project.ideas[0].id; },
    input => { input.project.selectedIdeaId = 'unknown'; },
    input => { input.project.package!.scenes[0].id = '../escape'; },
    input => { input.project.package!.scenes[0].locationId = 'unknown'; },
    input => { input.project.package!.scenes[0].characterIds = ['unknown']; },
    input => { input.project.package!.scenes[0].characterIds.push(input.project.package!.scenes[0].characterIds[0]); },
    input => { input.project.package!.scenes[0].durationSeconds = 4; },
    input => { input.project.targetDurationSeconds = 61; },
    input => { input.project.targetDurationSeconds = undefined; },
    input => { input.productionState.editor.sceneOrder = [input.project.package!.scenes[0].id]; },
    input => { input.productionState.editor.musicAssetId = randomUUID(); },
    input => { input.productionState.editor.soundEffects = [{ assetId: randomUUID(), sceneId: 'unknown', volume: 1 }]; },
    input => { input.productionState.scenes.foreign = { status: 'planned', notes: '', characterReference: '', locationReference: '' }; },
    input => { input.productionState.images = [{ id: randomUUID(), projectId: randomUUID(), originalName: 'test.png', width: 10, height: 10, createdAt: '' }]; },
    input => { input.clipProvenance[randomUUID()] = 'SYNTHETIC_MEDIA'; },
    input => { input.project.package!.scenes[0].flowPromptEn = 'ภาษาไทย'; },
  ];
  for (const mutate of invalid) {
    const input = structuredClone(baseline); mutate(input); assert.throws(() => buildProductionAcceptance(input));
  }
  for (const duration of [20, 45, 60]) assert.equal(buildProductionAcceptance(await snapshot(duration)).project.targetDurationSeconds, duration);
  const square = await snapshot(); square.project.aspectRatio = '1:1';
  assert.equal(buildProductionAcceptance(square).scenes[0].flowAspectRatio, '16:9');
  assert.match(buildProductionAcceptance(square).scenes[0].promptEn, /center square/);
});

test('file preparation refuses overwrite, workspace escapes, public outputs, oversized/invalid inputs and symlink aliases', async t => {
  const f = await fixture(t);
  prepareProductionAcceptance(f);
  const manifest = await readFile(join(f.outputDir, 'manifest.json'), 'utf8');
  assert.throws(() => prepareProductionAcceptance(f), /OUTPUT_ALREADY_EXISTS/);
  assert.equal(await readFile(join(f.outputDir, 'manifest.json'), 'utf8'), manifest);
  assert.throws(() => prepareProductionAcceptance({ ...f, outputDir: join(f.workspace, '..', 'escaped') }), /UNSAFE_PATH/);
  assert.throws(() => prepareProductionAcceptance({ ...f, inputPath: join(f.workspace, '..', 'foreign-input') }), /UNSAFE_PATH/);
  assert.throws(() => prepareProductionAcceptance({ ...f, outputDir: join(f.workspace, 'public', 'raw-story') }), /PRIVATE_OUTPUT_REQUIRED/);
  assert.throws(() => prepareProductionAcceptance({ ...f, outputDir: join(f.workspace, '.tmp', 'production-acceptance', 'con') }), /PRIVATE_OUTPUT_REQUIRED/);
  await writeFile(f.inputPath, 'private-invalid-json');
  assert.throws(() => prepareProductionAcceptance({ ...f, outputDir: f.outputDir.replace('first', 'invalid') }), /INVALID_INPUT_FILE/);
  await writeFile(f.inputPath, 'x'.repeat(1024 * 1024 + 1));
  assert.throws(() => prepareProductionAcceptance({ ...f, outputDir: f.outputDir.replace('first', 'large') }), /INVALID_INPUT_FILE/);
  await writeFile(f.inputPath, JSON.stringify(f.input));
  const alias = join(f.workspace, 'alias'); await symlink(join(f.workspace, '.tmp'), alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => prepareProductionAcceptance({ ...f, inputPath: join(alias, 'production-acceptance', 'first', 'manifest.json') }), /UNSAFE_PATH/);
  await rm(join(f.workspace, '.tmp', 'production-acceptance'), { recursive: true, force: true });
  await symlink(join(f.workspace, 'alias'), join(f.workspace, '.tmp', 'production-acceptance'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => prepareProductionAcceptance(f), /UNSAFE_PATH/);
  // Removing aliases is fixture-local; do not dereference junctions during cleanup.
  await rm(join(f.workspace, '.tmp', 'production-acceptance')); await rm(alias);
});

test('CLI outputs only a bounded summary and keeps failures private without logging snapshot values', async t => {
  const f = await fixture(t);
  const script = resolve('scripts', 'prepare-production-acceptance.mjs');
  const { stdout, stderr } = await run(process.execPath, ['--import', 'tsx', script, '--input', f.inputPath, '--output', f.outputDir], { cwd: f.workspace });
  assert.equal(stderr, ''); assert.equal(JSON.parse(stdout).sceneCount, 3); assert.doesNotMatch(stdout, /Synthetic acceptance story|MOCK sample|storyBible/);
  await writeFile(f.inputPath, 'private-secret-never-log');
  try {
    await run(process.execPath, ['--import', 'tsx', script, '--input', f.inputPath, '--output', f.outputDir.replace('first', 'bad')], { cwd: f.workspace });
    assert.fail('invalid input must exit unsuccessfully');
  } catch (failure) {
    const error = failure as Error & { stderr: string; stdout: string; code: number };
    assert.equal(error.code, 1); assert.equal(error.stdout, ''); assert.match(error.stderr, /Offline handoff failed/);
    assert.doesNotMatch(error.stderr, /private-secret-never-log/);
  }
});
