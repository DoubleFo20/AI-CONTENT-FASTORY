import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  ChabuCharacterSchema, ChabuEpisodeInputSchema, ChabuEpisodeSchema, ChabuLibrarySchema,
  ChabuProductSchema, ChabuStateSchema, type ChabuCharacterInput, type ChabuProductInput,
} from '../shared/chabu.js';
import { StoryPackageSchema } from '../shared/contracts.js';
import { registerChabu, buildChabuPackage } from '../server/chabu.js';
import { Store } from '../server/store.js';
import { ProjectFiles } from '../server/project-files.js';
import { Auth } from '../server/auth.js';
import { AppError } from '../server/errors.js';

const characterInput = (assetId?: string): ChabuCharacterInput => ({ name: 'Chabu', descriptionEn: 'A small cream cat with round brown eyes and a blue apron.', identityRules: ['Keep the blue apron and cream fur.'], references: assetId ? [{ assetId, angle: 'front' }] : [] });
const productInput = (assetId?: string): ChabuProductInput => ({ name: 'Studio Cup', model: 'C1', variant: 'Blue', descriptionEn: 'A blue ceramic cup with a white handle.', identityRules: ['Keep the white handle and blue body.'], verifiedSpecifications: ['Capacity: 250 ml'], unverifiedClaims: ['Keeps drinks hot for 24 hours'], prohibitedClaims: ['Cures illness'], affiliateUrl: 'https://example.invalid/chabu', references: assetId ? [{ assetId, angle: 'three-quarter' }] : [] });
const CreatedProjectSchema = z.object({ project: z.object({ id: z.uuid() }) });
const EpisodeResponseSchema = z.object({ episode: ChabuEpisodeSchema, project: z.object({ id: z.uuid(), status: z.string(), ideas: z.array(z.unknown()), selectedIdeaId: z.string().nullable(), package: StoryPackageSchema, generation: z.unknown().optional() }) });
const errorIs = (code: string) => (error: unknown) => error instanceof AppError && error.code === code;

async function start(dir: string) {
  const store = new Store(dir); const files = new ProjectFiles(dir); const auth = new Auth(store, false);
  const app = express(); app.use(express.json({ limit: '32kb' }));
  app.get('/session', (_req, res) => {
    const account = store.credentials('chabu_owner'); assert.ok(account);
    res.json(auth.issue(res, account.user));
  });
  app.use('/api', (req, res, next) => {
    try {
      const session = auth.require(req); res.locals.ownerId = session.user.id;
      if (req.method !== 'GET') auth.csrf(req, session.csrfToken);
      next();
    } catch (error) { next(error); }
  });
  const guard = registerChabu(app, store, files);
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const failure = error instanceof AppError ? error : error instanceof z.ZodError ? new AppError('INVALID_INPUT') : new AppError('INTERNAL_ERROR', 500);
    res.status(failure.status).json({ error: { code: failure.code } });
  });
  const server = createServer(app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { store, files, guard, base: `http://127.0.0.1:${address.port}`, async close() { await new Promise<void>(yes => server.close(() => yes())); store.close(); } };
}

async function fixture(t: TestContext) {
  await mkdir(resolve('.tmp'), { recursive: true }); const dir = await mkdtemp(join(resolve('.tmp'), 'chabu-'));
  const initial = new Store(dir); const owner = initial.createOwner('chabu_owner', 'synthetic-test-only'); initial.close();
  let runtime = await start(dir);
  const session = await fetch(`${runtime.base}/session`);
  const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const csrf = z.object({ csrfToken: z.string() }).parse(await session.json()).csrfToken;
  t.after(async () => { await runtime.close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, owner, get store() { return runtime.store; }, get files() { return runtime.files; }, get guard() { return runtime.guard; },
    metadataPath: join(dir, 'settings', 'chabu', `${owner.id}.json`),
    async restart() { await runtime.close(); runtime = await start(dir); },
    async call(path = '', method = 'GET', body?: unknown, authenticated = true, token = csrf) {
      const headers = new Headers(); if (authenticated) headers.set('Cookie', cookie);
      if (method !== 'GET') { headers.set('Content-Type', 'application/json'); headers.set('X-CSRF-Token', token); }
      return fetch(`${runtime.base}/api/chabu${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    },
  };
}

async function library(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await f.call('/library', 'POST', {}); assert.equal(response.status, 201);
  const id = CreatedProjectSchema.parse(await response.json()).project.id;
  const project = f.store.project(f.owner.id, id); const assetId = randomUUID(); const filename = `${assetId}.png`;
  await mkdir(join(f.dir, 'images'), { recursive: true });
  await writeFile(join(f.dir, 'images', filename), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c31kAAAAASUVORK5CYII=', 'base64'));
  f.files.addImage(project, f.owner.id, { id: assetId, projectId: id, originalName: 'reference.png', width: 1, height: 1, createdAt: new Date().toISOString(), filename });
  return { id, assetId, filename };
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const refs = await library(f);
  const character = ChabuCharacterSchema.parse(z.object({ character: ChabuCharacterSchema }).parse(await (await f.call('/characters', 'POST', characterInput(refs.assetId))).json()).character);
  const product = ChabuProductSchema.parse(z.object({ product: ChabuProductSchema }).parse(await (await f.call('/products', 'POST', productInput(refs.assetId))).json()).product);
  const input = ChabuEpisodeInputSchema.parse({ requestId: randomUUID(), name: 'Chabu cup episode', brief: 'Introduce the reference cup without unsupported claims.', characterId: character.id, characterVersionId: character.versions[0].id, productId: product.id, productVersionId: product.versions[0].id });
  return { ...refs, character, product, input };
}

test('CHABU reads are private and read-only; library creation is owner-scoped and idempotent', async t => {
  const f = await fixture(t);
  assert.equal((await f.call('', 'GET', undefined, false)).status, 401);
  assert.equal((await f.call('/library', 'POST', {}, true, 'invalid')).status, 403);
  assert.deepEqual(ChabuStateSchema.parse(await (await f.call()).json()), { libraryProjectId: null, characters: [], products: [], episodes: [], execution: 'local_only' });
  assert.equal(await readFile(f.metadataPath).catch(() => null), null);
  const refs = await library(f);
  const again = await f.call('/library', 'POST', {}); assert.equal(again.status, 200);
  assert.equal(CreatedProjectSchema.parse(await again.json()).project.id, refs.id);
  assert.equal(f.store.listProjects(f.owner.id).length, 1);
  assert.equal(f.store.listProjects(f.owner.id, false).length, 0);
  assert.throws(() => f.store.enqueue(f.owner.id, refs.id, 'ideas'), errorIs('CONFLICT'));
  await f.restart();
  assert.equal(ChabuStateSchema.parse(await (await f.call()).json()).libraryProjectId, refs.id);
});

test('reference versions use existing library image assets and reject foreign assets and immutable-field injection', async t => {
  const f = await fixture(t); const refs = await library(f);
  const foreign = f.store.createProject(f.owner.id, { name: 'Other project', brief: 'Reference not belonging to the CHABU library.', genre: 'Test', audience: 'Test', aspectRatio: '9:16' });
  const otherId = randomUUID(); f.files.addImage(foreign, f.owner.id, { id: otherId, projectId: foreign.id, originalName: 'other.png', width: 1, height: 1, createdAt: new Date().toISOString(), filename: `${otherId}.png` });
  assert.equal((await f.call('/characters', 'POST', characterInput(otherId))).status, 404);
  assert.equal((await f.call('/products', 'POST', productInput(randomUUID()))).status, 404);
  assert.equal((await f.call('/characters', 'POST', { ...characterInput(refs.assetId), revision: 9 })).status, 400);
  assert.equal((await f.call('/products', 'POST', { ...productInput(refs.assetId), affiliateUrl: 'javascript:alert(1)' })).status, 400);
  const response = await f.call('/characters', 'POST', characterInput(refs.assetId)); assert.equal(response.status, 201);
  const first = z.object({ character: ChabuCharacterSchema }).parse(await response.json()).character;
  const next = await f.call(`/characters/${first.id}/versions`, 'POST', { ...characterInput(refs.assetId), descriptionEn: 'An updated reference identity.' }); assert.equal(next.status, 201);
  const character = z.object({ character: ChabuCharacterSchema }).parse(await next.json()).character;
  assert.deepEqual(character.versions[0], first.versions[0]); assert.equal(character.versions[1].revision, 2);
  assert.notEqual(character.versions[1].id, character.versions[0].id);
  await f.restart(); assert.deepEqual(ChabuStateSchema.parse(await (await f.call()).json()).characters[0], character);
});

test('episodes deterministically produce four ten-second scenes, pin versions and reuse the editor without fake ideas', async t => {
  const f = await fixture(t); const p = await prepared(f);
  const bytes = await readFile(join(f.dir, 'images', p.filename));
  const created = await f.call('/episodes', 'POST', p.input); assert.equal(created.status, 201);
  const result = EpisodeResponseSchema.parse(await created.json());
  assert.deepEqual(result.project.package.scenes.map(scene => scene.durationSeconds), [10, 10, 10, 10]);
  assert.deepEqual(result.project.ideas, []); assert.equal(result.project.selectedIdeaId, null); assert.equal(result.project.generation, undefined);
  assert.equal(result.project.status, 'expanded'); assert.equal(result.episode.provider, 'manual_flow_primary_meta_supporting');
  assert.deepEqual(buildChabuPackage(result.episode), buildChabuPackage(result.episode));
  assert.deepEqual(buildChabuPackage(result.episode), result.project.package);
  const prompts = result.project.package.continuityRules.map(rule => rule.en).join('\n');
  for (const lock of ['Character identity lock:', 'Product identity lock:', 'Scene and lighting lock:', 'Thai female narrator', 'Meta is optional manual support only', 'Owner-verified specification: Capacity: 250 ml', 'Unverified: DO NOT ASSERT', 'Prohibited: NEVER ASSERT', p.assetId]) assert.ok(prompts.includes(lock));
  for (const scene of result.project.package.scenes) {
    assert.match(scene.explanationTh, /[\u0E00-\u0E7F]/u); assert.match(scene.narration.th, /ค่ะ|คะ/u);
    assert.equal(scene.narration.th.includes('Cures illness'), false); assert.equal(scene.narration.th.includes('24 hours'), false);
  }
  assert.match(result.project.package.scenes[3].narration.th, /แอฟฟิลิเอต.*ค่าคอมมิชชัน/u);
  assert.equal((await f.call(`/characters/${p.character.id}/versions`, 'POST', { ...characterInput(p.assetId), descriptionEn: 'Different future identity.' })).status, 201);
  assert.equal((await f.call(`/products/${p.product.id}/versions`, 'POST', { ...productInput(p.assetId), variant: 'Future red' })).status, 201);
  await f.restart();
  const state = ChabuStateSchema.parse(await (await f.call()).json());
  assert.deepEqual(state.episodes[0].character, p.character.versions[0]); assert.deepEqual(state.episodes[0].product, p.product.versions[0]);
  assert.deepEqual(state.episodes[0].jobs, []); assert.equal(state.episodes[0].importedClips, 0);
  assert.deepEqual(await readFile(join(f.dir, 'images', p.filename)), bytes);
  const prepare = f.store.createPreparedProject;
  f.store.createPreparedProject = () => { throw new Error('A cached episode must not be materialized again'); };
  const again = await f.call('/episodes', 'POST', p.input); assert.equal(again.status, 200);
  f.store.createPreparedProject = prepare;
  assert.equal(EpisodeResponseSchema.parse(await again.json()).project.id, result.project.id);
  assert.equal(f.store.listProjects(f.owner.id).length, 2);
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, name: 'Changed request payload' })).status, 409);
  assert.throws(() => f.store.enqueue(f.owner.id, result.project.id, 'ideas'), errorIs('CONFLICT'));
  assert.throws(() => f.store.enqueue(f.owner.id, result.project.id, 'expand'), errorIs('CONFLICT'));
});

test('durable request IDs repair interrupted materialization after restart and GET never repairs implicitly', async t => {
  const f = await fixture(t); const p = await prepared(f);
  f.store.createPreparedProject = () => { throw new AppError('INTERNAL_ERROR', 500); };
  assert.equal((await f.call('/episodes', 'POST', p.input)).status, 500);
  const pending = ChabuLibrarySchema.parse(JSON.parse(await readFile(f.metadataPath, 'utf8'))).episodes[0];
  const before = await readFile(f.metadataPath, 'utf8');
  assert.equal((await f.call()).status, 409);
  assert.equal((await f.call(`/episodes/${pending.id}`)).status, 409);
  assert.equal(await readFile(f.metadataPath, 'utf8'), before);
  await f.restart();
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, brief: 'An altered request with the same identifier.' })).status, 409);
  assert.equal((await f.call('/recover', 'POST', {}, false)).status, 401);
  assert.equal((await f.call('/recover', 'POST', {}, true, 'wrong-csrf')).status, 403);
  const recovered = await f.call('/recover', 'POST', {}); assert.equal(recovered.status, 200);
  assert.equal(ChabuStateSchema.parse(await recovered.json()).episodes[0].project.id, pending.projectId);
  const preserved = f.store.project(f.owner.id, pending.projectId);
  assert.equal((await f.call('/recover', 'POST', {})).status, 200);
  assert.deepEqual(f.store.project(f.owner.id, pending.projectId), preserved);
  const repaired = await f.call('/episodes', 'POST', p.input); assert.equal(repaired.status, 200);
  const result = EpisodeResponseSchema.parse(await repaired.json());
  assert.equal(result.episode.id, pending.id); assert.equal(result.project.id, pending.projectId);
  assert.equal(ChabuStateSchema.parse(await (await f.call()).json()).episodes.length, 1);
  assert.equal(f.store.listProjects(f.owner.id).length, 2);
});

test('selected CHABUNG identity drives every character action and narration instead of the studio brand', async t => {
  const f = await fixture(t); const p = await prepared(f);
  const changed = await f.call(`/characters/${p.character.id}/versions`, 'POST', { ...characterInput(p.assetId), name: 'CHABUNG', descriptionEn: 'A brown dog with floppy ears and a green shirt.', identityRules: ['Keep the floppy ears and green shirt.'] });
  const character = z.object({ character: ChabuCharacterSchema }).parse(await changed.json()).character;
  const result = EpisodeResponseSchema.parse(await (await f.call('/episodes', 'POST', { ...p.input, characterVersionId: character.versions[1].id })).json());
  const pack = result.project.package;
  assert.equal(pack.characters[0].name, 'CHABUNG'); assert.match(pack.characters[0].visualDescriptionEn, /brown dog/u);
  assert.match(pack.continuityRules.map(rule => rule.en).join('\n'), /Character identity lock: CHABUNG.*brown dog/u);
  for (const scene of pack.scenes) {
    assert.match(scene.flowPromptEn, /CHABUNG/u); assert.ok(scene.flowPromptEn.includes(p.assetId));
    assert.doesNotMatch(scene.flowPromptEn, /CHABU (?:stands|calmly|keeps|may)|ชาบู/u);
    assert.doesNotMatch(scene.narration.th, /ชาบู/u); assert.doesNotMatch(scene.narration.en, /CHABU (?:introduces|may)/u);
  }
});

test('generation requires character and product references, bounds total duration and cannot assert blocked specifications', async t => {
  const f = await fixture(t); const p = await prepared(f);
  const noRefs = z.object({ character: ChabuCharacterSchema }).parse(await (await f.call('/characters', 'POST', characterInput())).json()).character;
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, characterId: noRefs.id, characterVersionId: noRefs.versions[0].id })).status, 400);
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, clipCount: 12, clipDurationSeconds: 20 })).status, 400);
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, productVersionId: randomUUID() })).status, 404);
  const other = z.object({ product: ChabuProductSchema }).parse(await (await f.call('/products', 'POST', { ...productInput(p.assetId), verifiedSpecifications: ['Cures illness'] })).json()).product;
  assert.equal((await f.call('/episodes', 'POST', { ...p.input, productId: other.id, productVersionId: other.versions[0].id })).status, 400);
  assert.equal(ChabuStateSchema.parse(await (await f.call()).json()).episodes.length, 0);
  const custom = await f.call('/episodes', 'POST', { ...p.input, clipCount: 3, clipDurationSeconds: 12, aspectRatio: '16:9' }); assert.equal(custom.status, 201);
  assert.deepEqual(EpisodeResponseSchema.parse(await custom.json()).project.package.scenes.map(scene => scene.durationSeconds), [12, 12, 12]);
});

test('clip import guard enforces scene duration and ratio while preserving ordinary project imports and queue jobs', async t => {
  const f = await fixture(t); const p = await prepared(f);
  const result = EpisodeResponseSchema.parse(await (await f.call('/episodes', 'POST', p.input)).json());
  const guard = f.guard.validateClip; const scene = result.project.package.scenes[0];
  guard(f.owner.id, result.project.id, scene.id, { duration: 9.25, width: 720, height: 1280 });
  guard(f.owner.id, result.project.id, scene.id, { duration: 10.75, width: 1080, height: 1920 });
  f.guard.assertExportable(f.owner.id, result.project.id);
  f.guard.assertExportable(f.owner.id, p.id);
  for (const media of [{ duration: 9.24, width: 720, height: 1280 }, { duration: 11, width: 720, height: 1280 }, { duration: 10, width: 1280, height: 720 }, { duration: 10, width: 0, height: 1280 }, { duration: NaN, width: 720, height: 1280 }]) assert.throws(() => guard(f.owner.id, result.project.id, scene.id, media), errorIs('INVALID_MEDIA'));
  assert.throws(() => guard(f.owner.id, result.project.id, 'foreign_scene', { duration: 10, width: 720, height: 1280 }), errorIs('INVALID_MEDIA'));
  guard(f.owner.id, p.id, 'ordinary', { duration: 1, width: 1280, height: 720 });
  for (const item of result.project.package.scenes) f.store.addClip(f.owner.id, result.project.id, item.id, `${randomUUID()}.mp4`, 'owner-flow.mp4', 10);
  const job = f.store.enqueue(f.owner.id, result.project.id, 'export');
  const state = ChabuStateSchema.parse(await (await f.call()).json());
  assert.equal(state.episodes[0].project.status, 'clips_ready'); assert.equal(state.episodes[0].importedClips, 4);
  assert.equal(state.episodes[0].jobs[0].id, job.id); assert.equal(state.episodes[0].jobs[0].type, 'export');
  assert.equal((await f.call(`/episodes/${result.episode.id}/stage`, 'POST', { stage: 'cancelled' })).status, 409);
});

test('manual handoff stages persist without starting a worker; cancellation is terminal and rejects further imports', async t => {
  const f = await fixture(t); const p = await prepared(f);
  const result = EpisodeResponseSchema.parse(await (await f.call('/episodes', 'POST', p.input)).json());
  for (const stage of ['awaiting_external_generation', 'awaiting_upload', 'cancelled']) {
    const response = await f.call(`/episodes/${result.episode.id}/stage`, 'POST', { stage }); assert.equal(response.status, 200);
    assert.equal(z.object({ episode: ChabuEpisodeSchema }).parse(await response.json()).episode.manualStage, stage);
  }
  assert.equal((await f.call(`/episodes/${result.episode.id}/stage`, 'POST', { stage: 'draft' })).status, 409);
  assert.equal((await f.call(`/episodes/${result.episode.id}/stage`, 'POST', { stage: 'cloud_running' })).status, 400);
  assert.throws(() => f.guard.validateClip(f.owner.id, result.project.id, 'chabu_scene_1', { duration: 10, width: 720, height: 1280 }), errorIs('CONFLICT'));
  assert.throws(() => f.guard.assertExportable(f.owner.id, result.project.id), errorIs('CONFLICT'));
  await f.restart();
  const state = ChabuStateSchema.parse(await (await f.call()).json());
  assert.equal(state.episodes[0].manualStage, 'cancelled'); assert.deepEqual(state.episodes[0].jobs, []); assert.equal(state.execution, 'local_only');
  assert.equal((await f.call('/episodes', 'POST', p.input)).status, 200);
  assert.equal(f.store.listProjects(f.owner.id).length, 2);
});

test('corrupt, foreign-owner, oversized and tampered immutable metadata fail closed without overwriting the file', async t => {
  const f = await fixture(t); const p = await prepared(f);
  assert.equal((await f.call('/episodes', 'POST', p.input)).status, 201);
  const original = await readFile(f.metadataPath, 'utf8'); const parsed = ChabuLibrarySchema.parse(JSON.parse(original));
  const tampered = structuredClone(parsed); tampered.episodes[0].character.descriptionEn = 'Replaced immutable snapshot';
  for (const value of ['{broken-private-metadata', JSON.stringify({ ...parsed, ownerId: randomUUID() }), JSON.stringify(tampered), ' '.repeat(4 * 1024 * 1024 + 1)]) {
    await writeFile(f.metadataPath, value);
    const response = await f.call(); assert.ok([404, 500].includes(response.status));
    assert.doesNotMatch(await response.text(), /broken-private|Replaced immutable|descriptionEn/u);
    assert.equal((await f.call('/library', 'POST', {})).status >= 400, true);
    assert.equal(await readFile(f.metadataPath, 'utf8'), value);
  }
  await writeFile(f.metadataPath, original);
  assert.equal((await f.call()).status, 200);
});

test('metadata directory symlinks cannot redirect owner state or library writes', async t => {
  const f = await fixture(t);
  await mkdir(join(f.dir, 'settings')); await mkdir(join(f.dir, 'trap'));
  try { await symlink(join(f.dir, 'trap'), join(f.dir, 'settings', 'chabu'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM') { t.skip('Host does not permit test symlinks.'); return; }
    throw error;
  }
  assert.equal((await f.call()).status, 500); assert.equal((await f.call('/library', 'POST', {})).status, 500);
  assert.deepEqual(await readdir(join(f.dir, 'trap')), []); assert.equal(f.store.listProjects(f.owner.id).length, 0);
});

test('hardlinked owner metadata is rejected without changing the linked bytes', async t => {
  const f = await fixture(t); await library(f);
  const original = await readFile(f.metadataPath, 'utf8');
  await link(f.metadataPath, join(f.dir, 'linked-state.json'));
  assert.equal((await f.call()).status, 500);
  assert.equal((await f.call('/characters', 'POST', characterInput())).status, 500);
  assert.equal(await readFile(join(f.dir, 'linked-state.json'), 'utf8'), original);
});
