import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createApplication } from '../server/app.js';
import type { AiProvider } from '../server/ai/types.js';
import { EditorSettingsSchema } from '../shared/production.js';
import type { Idea, Project, ProjectInput, StoryPackage } from '../shared/contracts.js';
import type { ChabuCharacterVersion, ChabuProductVersion } from '../shared/chabu.js';

const run = promisify(execFile);
const origin = 'http://127.0.0.1:5173';
const credentials = { username: 'chabu_video_owner', password: 'synthetic-chabu-test-only-2026' };
const input: ProjectInput = { name: 'Story Factory preservation fixture', brief: 'A child safely returns a lost umbrella during a summer rain.', genre: 'Warm drama', audience: 'General', aspectRatio: '9:16', targetDurationSeconds: 12 };
type ApiRequest = (path: string, options?: { method?: string; json?: unknown; form?: FormData; headers?: RequestInit['headers']; csrf?: boolean }, authenticated?: boolean) => Promise<Response>;

async function fixture(t: TestContext) {
  const root = resolve('.tmp'); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'chabu-video-acceptance-'));
  const calls = { ideas: 0, expansion: 0 };
  const provider: AiProvider = {
    async generateIdeas() { calls.ideas++; throw new Error('Provider must not be called by CHABU acceptance.'); },
    async expandStory() { calls.expansion++; throw new Error('Provider must not be called by CHABU acceptance.'); },
  };
  let active: { application: ReturnType<typeof createApplication>; server: ReturnType<typeof createServer>; base: string } | null = null;
  let cookie = ''; let csrf = '';
  async function close() {
    const current = active; active = null;
    if (!current) return;
    try { await new Promise<void>((yes, no) => current.server.close(error => error ? no(error) : yes())); }
    finally { await current.application.close(); }
  }
  async function start() {
    assert.equal(active, null);
    const application = createApplication({ dataDir: dir, provider, startWorker: false, allowedOrigins: [origin] });
    const server = createServer(application.app);
    await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    active = { application, server, base: `http://127.0.0.1:${address.port}/api` };
    return application;
  }
  async function authenticate(path: '/auth/setup' | '/auth/login', expected: number) {
    cookie = ''; csrf = '';
    const response = await request(path, { method: 'POST', json: credentials }, false);
    assert.equal(response.status, expected);
    const body = await response.json() as { csrfToken: string };
    const session = response.headers.get('set-cookie'); assert.ok(session);
    cookie = session.split(';')[0]; csrf = body.csrfToken;
  }
  async function request(path: string, options: { method?: string; json?: unknown; form?: FormData; headers?: RequestInit['headers']; csrf?: boolean } = {}, authenticated = true) {
    assert.ok(active);
    const method = options.method ?? 'GET'; const headers = new Headers(options.headers);
    if (authenticated && cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') { headers.set('Origin', origin); if (authenticated && csrf && options.csrf !== false) headers.set('X-CSRF-Token', csrf); }
    let body: RequestInit['body'];
    if (options.form) body = options.form;
    else if (options.json !== undefined) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(options.json); }
    return fetch(`${active.base}${path}`, { method, headers, body });
  }
  t.after(async () => { await close(); await rm(dir, { recursive: true, force: true }); });
  return { dir, calls, start, close, authenticate, request, get application() { assert.ok(active); return active.application; } };
}

function storyIdeas(): Idea[] {
  return Array.from({ length: 10 }, (_, index) => ({ id: `preserve_idea_${index + 1}`, title: { th: `ไอเดีย ${index + 1}`, en: `Idea ${index + 1}` }, logline: { th: `เรื่องย่อ ${index + 1}`, en: `Logline ${index + 1}` }, hook: { th: `จุดดึงดูด ${index + 1}`, en: `Hook ${index + 1}` } }));
}

const story: StoryPackage = {
  storyBible: { th: 'เรื่องทดสอบเดิม', en: 'Existing Story Factory fixture.' },
  characters: [{ id: 'story_character', name: 'Mali', visualDescriptionEn: 'A child in a yellow raincoat.', background: { th: 'เด็กใจดี', en: 'A kind child.' } }],
  locations: [{ id: 'story_location', name: { th: 'สวน', en: 'Garden' }, visualDescriptionEn: 'A quiet garden.', description: { th: 'สวนหลังฝน', en: 'A garden after rain.' } }],
  continuityRules: [{ th: 'เสื้อกันฝนสีเหลือง', en: 'Keep the raincoat yellow.' }],
  scenes: [1, 2, 3].map(order => ({ id: `story_scene_${order}`, order, durationSeconds: 4, title: { th: `ฉาก ${order}`, en: `Scene ${order}` }, explanationTh: `คำอธิบายฉาก ${order}`, flowPromptEn: `Mali returns an umbrella in scene ${order}.`, narration: { th: 'ขอบคุณที่ช่วยกันนะคะ', en: 'Thank you for helping.' }, characterIds: ['story_character'], locationId: 'story_location' })),
};

async function seedStoryFactory(app: ReturnType<typeof createApplication>, ownerId: string, request: ApiRequest): Promise<Project> {
  const created = await request('/projects', { method: 'POST', json: input }); assert.equal(created.status, 201);
  const project = (await created.json() as { project: Project }).project;
  const ideasJob = app.store.enqueue(ownerId, project.id, 'ideas');
  const claimedIdeas = app.store.claim(); assert.ok(claimedIdeas);
  assert.equal(claimedIdeas.job.id, ideasJob.id); assert.equal(app.store.completeIdeas(claimedIdeas.job, storyIdeas()), true);
  const selected = await request(`/projects/${project.id}/select`, { method: 'POST', json: { ideaId: 'preserve_idea_4' } }); assert.equal(selected.status, 200);
  const expansionJob = app.store.enqueue(ownerId, project.id, 'expand');
  const claimedExpansion = app.store.claim(); assert.ok(claimedExpansion);
  assert.equal(claimedExpansion.job.id, expansionJob.id); assert.equal(app.store.completePackage(claimedExpansion.job, story), true);
  return (await app.store.project(ownerId, project.id));
}

async function upload<T>(request: ApiRequest, path: string, field: string, filePath: string, filename: string, type: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  form.append(field, new Blob([new Uint8Array(await readFile(filePath))], { type }), filename);
  const response = await request(path, { method: 'POST', form });
  return { response, body: await response.json() as T };
}

test('CHABU / MOCK_TEXT / SYNTHETIC_MEDIA: four 10-second portrait clips export, decode and reopen unchanged', { timeout: 180_000 }, async t => {
  const f = await fixture(t); let app = await f.start();
  await f.authenticate('/auth/setup', 201);
  assert.equal((await f.request('/chabu', {}, false)).status, 401);
  assert.equal((await f.request('/chabu/library', { method: 'POST', json: {}, csrf: false })).status, 403);
  const owner = app.store.credentials(credentials.username); assert.ok(owner);
  const originalStory = await seedStoryFactory(app, owner.user.id, f.request);
  const storyBefore = structuredClone(app.store.project(owner.user.id, originalStory.id));

  const libraryResponse = await f.request('/chabu/library', { method: 'POST', json: {} }); assert.equal(libraryResponse.status, 201);
  const libraryProjectId = (await libraryResponse.json() as { project: { id: string } }).project.id;
  const reference = join(f.dir, 'SYNTHETIC_MEDIA-reference.png');
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=90x160', '-frames:v', '1', reference], { timeout: 30_000, windowsHide: true });
  const refs: Array<{ id: string }> = [];
  for (const kind of ['character', 'product']) {
    const uploaded = await upload<{ asset: { id: string } }>(f.request, `/projects/${libraryProjectId}/images`, 'image', reference, `SYNTHETIC_MEDIA-${kind}.png`, 'image/png');
    assert.equal(uploaded.response.status, 201); refs.push({ id: uploaded.body.asset.id });
    const fetched = await f.request(`/projects/${libraryProjectId}/images/${uploaded.body.asset.id}/file`);
    assert.equal(fetched.status, 200); assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), await readFile(reference));
  }

  const foreignProjectResponse = await f.request('/projects', { method: 'POST', json: { ...input, name: 'Foreign reference project' } }); assert.equal(foreignProjectResponse.status, 201);
  const foreignProject = (await foreignProjectResponse.json() as { project: Project }).project;
  const foreignImage = await upload<{ asset: { id: string } }>(f.request, `/projects/${foreignProject.id}/images`, 'image', reference, 'SYNTHETIC_MEDIA-foreign.png', 'image/png'); assert.equal(foreignImage.response.status, 201);
  const badCharacter = await f.request('/chabu/characters', { method: 'POST', json: { name: 'Chabu', descriptionEn: 'Cream cat.', identityRules: ['Keep cream fur.'], references: [{ assetId: foreignImage.body.asset.id, angle: 'front' }] } });
  assert.equal(badCharacter.status, 404);

  const characterResponse = await f.request('/chabu/characters', { method: 'POST', json: { name: 'Chabu', descriptionEn: 'A cream cat with a blue apron.', identityRules: ['Keep cream fur and blue apron.'], references: [{ assetId: refs[0].id, angle: 'front' }] } }); assert.equal(characterResponse.status, 201);
  const character = (await characterResponse.json() as { character: { id: string; versions: ChabuCharacterVersion[] } }).character;
  const productResponse = await f.request('/chabu/products', { method: 'POST', json: { name: 'Studio Cup', model: 'C1', variant: 'Blue', descriptionEn: 'A blue cup with a white handle.', identityRules: ['Keep the blue body and white handle.'], verifiedSpecifications: ['Capacity: 250 ml'], unverifiedClaims: ['Keeps drinks hot for 24 hours'], prohibitedClaims: ['Cures illness'], affiliateUrl: 'https://example.invalid/product', references: [{ assetId: refs[1].id, angle: 'three-quarter' }] } }); assert.equal(productResponse.status, 201);
  const product = (await productResponse.json() as { product: { id: string; versions: ChabuProductVersion[] } }).product;
  const episodeInput = { requestId: randomUUID(), name: 'Synthetic four clip cup episode', brief: 'Show only the supplied cup details and make no unsupported claims.', characterId: character.id, characterVersionId: character.versions[0].id, productId: product.id, productVersionId: product.versions[0].id, clipCount: 4, clipDurationSeconds: 10, aspectRatio: '9:16' } as const;
  const episodeResponse = await f.request('/chabu/episodes', { method: 'POST', json: episodeInput }); assert.equal(episodeResponse.status, 201);
  const created = await episodeResponse.json() as { episode: { id: string; projectId: string; provider: string; character: unknown; product: unknown }; project: Project };
  const chabuProjectId = created.project.id; const episodeId = created.episode.id;
  assert.equal(created.project.ideas.length, 0); assert.equal(created.project.selectedIdeaId, null); assert.equal(created.project.status, 'expanded');
  assert.deepEqual(created.project.package?.scenes.map(scene => scene.durationSeconds), [10, 10, 10, 10]);
  assert.equal(created.episode.provider, 'manual_flow_primary_meta_supporting');
  const replay = await f.request('/chabu/episodes', { method: 'POST', json: episodeInput }); assert.equal(replay.status, 200);
  const replayBody = await replay.json() as { episode: { id: string }; project: Project };
  assert.equal(replayBody.episode.id, episodeId); assert.equal(replayBody.project.id, chabuProjectId);
  assert.equal((await f.request('/chabu/episodes', { method: 'POST', json: { ...episodeInput, brief: 'Changed payload under the same request ID.' } })).status, 409);
  assert.equal((await f.request(`/chabu/characters/${character.id}/versions`, { method: 'POST', json: { name: 'Chabu', descriptionEn: 'Future green cat.', identityRules: ['Future version only.'], references: [{ assetId: refs[0].id, angle: 'front' }] } })).status, 201);
  assert.equal((await f.request(`/chabu/products/${product.id}/versions`, { method: 'POST', json: { name: 'Studio Cup', model: 'C1', variant: 'Future red', descriptionEn: 'Future version only.', identityRules: ['Future version only.'], verifiedSpecifications: [], unverifiedClaims: [], prohibitedClaims: [], affiliateUrl: '', references: [{ assetId: refs[1].id, angle: 'front' }] } })).status, 201);
  const pinned = await f.request(`/chabu/episodes/${episodeId}`); assert.equal(pinned.status, 200);
  const pinnedEpisode = (await pinned.json() as { episode: { character: { id: string }; product: { id: string } } }).episode;
  assert.equal(pinnedEpisode.character.id, character.versions[0].id); assert.equal(pinnedEpisode.product.id, product.versions[0].id);

  const production = await f.request(`/projects/${chabuProjectId}/production`); assert.equal(production.status, 200);
  const editor = EditorSettingsSchema.parse({ resolution: '720p', quality: 'draft', subtitleLocale: 'th' });
  assert.equal((await f.request(`/projects/${chabuProjectId}/production`, { method: 'POST', json: { editor } })).status, 200);

  const validClip = join(f.dir, 'SYNTHETIC_MEDIA-portrait.mp4');
  const wrongRatioClip = join(f.dir, 'SYNTHETIC_MEDIA-landscape.mp4');
  const wrongDurationClip = join(f.dir, 'SYNTHETIC_MEDIA-short.mp4');
  const makeClip = async (path: string, size: string, duration: number) => run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=blue:s=${size}:r=12`, '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', path], { timeout: 30_000, windowsHide: true });
  await makeClip(validClip, '90x160', 10); await makeClip(wrongRatioClip, '160x90', 10); await makeClip(wrongDurationClip, '90x160', 9);
  const scenes = created.project.package!.scenes;
  const clipsDir = join(f.dir, 'clips');
  assert.equal((await readdir(clipsDir)).length, 0);
  const invalidRatio = await upload<{ error: { code: string } }>(f.request, `/projects/${chabuProjectId}/clips`, 'clip', wrongRatioClip, `${scenes[0].id}.mp4`, 'video/mp4', { sceneId: scenes[0].id });
  assert.equal(invalidRatio.response.status, 400); assert.equal(invalidRatio.body.error.code, 'INVALID_MEDIA'); assert.equal((await readdir(clipsDir)).length, 0);
  const invalidDuration = await upload<{ error: { code: string } }>(f.request, `/projects/${chabuProjectId}/clips`, 'clip', wrongDurationClip, `${scenes[0].id}.mp4`, 'video/mp4', { sceneId: scenes[0].id });
  assert.equal(invalidDuration.response.status, 400); assert.equal(invalidDuration.body.error.code, 'INVALID_MEDIA'); assert.equal((await readdir(clipsDir)).length, 0);

  for (const [index, scene] of scenes.entries()) {
    const uploaded = await upload<{ clip: { sceneId: string } }>(f.request, `/projects/${chabuProjectId}/clips`, 'clip', validClip, `${scene.id}.mp4`, 'video/mp4', { sceneId: scene.id });
    assert.equal(uploaded.response.status, 201); assert.equal(uploaded.body.clip.sceneId, scene.id);
    const clip = (await app.store.project(owner.user.id, chabuProjectId)).clips.find(item => item.sceneId === scene.id); assert.ok(clip);
    const response = await f.request(`/clips/${clip.id}/file`); assert.equal(response.status, 200);
    if (index === 0) assert.ok(Buffer.from(await response.arrayBuffer()).length > 100);
    else await response.arrayBuffer();
  }
  const ready = await f.request(`/projects/${chabuProjectId}`); assert.equal(ready.status, 200);
  assert.equal((await ready.json() as { project: Project }).project.clips.length, 4);
  assert.equal((await f.request(`/projects/${chabuProjectId}/export`, { method: 'POST' })).status, 202);
  assert.equal(await app.worker.runNext(), true);
  assert.deepEqual(f.calls, { ideas: 0, expansion: 0 });
  const exported = (await (await f.request(`/projects/${chabuProjectId}`)).json() as { project: Project }).project;
  assert.equal(exported.status, 'exported'); assert.ok(exported.export);
  const jobs = (await (await f.request('/jobs')).json() as { jobs: Array<{ projectId: string; type: string; status: string }> }).jobs;
  assert.deepEqual(jobs.filter(job => job.projectId === chabuProjectId).map(job => [job.type, job.status]), [['export', 'completed']]);
  assert.deepEqual(jobs.filter(job => job.projectId === originalStory.id).map(job => job.type).sort(), ['expand', 'ideas']);
  const exportUrl = `/exports/${exported.export!.id}/file`;
  const exportResponse = await f.request(exportUrl); assert.equal(exportResponse.status, 200);
  const bytes = Buffer.from(await exportResponse.arrayBuffer()); assert.ok(bytes.length > 1000);
  const downloaded = join(f.dir, 'SYNTHETIC_MEDIA-final.mp4'); await writeFile(downloaded, bytes);
  const probe = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', downloaded], { timeout: 30_000, windowsHide: true });
  const info = JSON.parse(probe.stdout) as { format: { duration: string }; streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
  const video = info.streams.find(stream => stream.codec_type === 'video'); const audio = info.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(video?.width, 720); assert.equal(video?.height, 1280); assert.equal(video?.codec_name, 'h264');
  assert.equal(audio?.codec_name, 'aac'); assert.ok(Math.abs(Number(info.format.duration) - 40) < 0.25);
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-i', downloaded, '-f', 'null', '-'], { timeout: 60_000, windowsHide: true });
  const hash = createHash('sha256').update(bytes).digest('hex');

  const cancelledInput = { ...episodeInput, requestId: randomUUID(), name: 'Cancelled manual handoff' };
  const cancelledResponse = await f.request('/chabu/episodes', { method: 'POST', json: cancelledInput }); assert.equal(cancelledResponse.status, 201);
  const cancelledProject = (await cancelledResponse.json() as { project: Project }).project;
  const state = await f.request('/chabu'); const episodes = (await state.json() as { episodes: Array<{ id: string; projectId: string }> }).episodes;
  const cancelledEpisode = episodes.find(item => item.projectId === cancelledProject.id); assert.ok(cancelledEpisode);
  assert.equal((await f.request(`/chabu/episodes/${cancelledEpisode.id}/stage`, { method: 'POST', json: { stage: 'cancelled' } })).status, 200);
  assert.equal((await f.request(`/projects/${cancelledProject.id}/export`, { method: 'POST' })).status, 409);
  const cancelledUpload = await upload<{ error: { code: string } }>(f.request, `/projects/${cancelledProject.id}/clips`, 'clip', validClip, 'cancelled.mp4', 'video/mp4', { sceneId: 'chabu_scene_1' });
  assert.equal(cancelledUpload.response.status, 409); assert.equal(cancelledUpload.body.error.code, 'CONFLICT');

  const originalId = originalStory.id;
  await f.close(); app = await f.start(); await f.authenticate('/auth/login', 200);
  assert.deepEqual(await app.store.project(owner.user.id, originalId), storyBefore);
  const reopened = (await (await f.request(`/projects/${chabuProjectId}`)).json() as { project: Project }).project;
  assert.deepEqual(reopened, exported);
  const reopenedState = await f.request('/chabu'); assert.equal(reopenedState.status, 200);
  const reopenedEpisodes = (await reopenedState.json() as { episodes: Array<{ id: string; character: { id: string }; product: { id: string }; manualStage: string; jobs: Array<{ type: string }> }> }).episodes;
  const reopenedEpisode = reopenedEpisodes.find(item => item.id === episodeId); assert.ok(reopenedEpisode);
  assert.equal(reopenedEpisode.character.id, character.versions[0].id); assert.equal(reopenedEpisode.product.id, product.versions[0].id);
  assert.deepEqual(reopenedEpisode.jobs.map(job => job.type), ['export']);
  assert.equal(reopenedEpisodes.find(item => item.id === cancelledEpisode.id)?.manualStage, 'cancelled');
  assert.deepEqual(f.calls, { ideas: 0, expansion: 0 });
  const persistedExport = await f.request(exportUrl); assert.equal(persistedExport.status, 200);
  const persistedBytes = Buffer.from(await persistedExport.arrayBuffer()); assert.deepEqual(persistedBytes, bytes);
  assert.equal(createHash('sha256').update(persistedBytes).digest('hex'), hash);
  for (const ref of refs) {
    const image = await f.request(`/projects/${libraryProjectId}/images/${ref.id}/file`);
    assert.equal(image.status, 200); assert.deepEqual(Buffer.from(await image.arrayBuffer()), await readFile(reference));
  }

  if (process.env.ACF_KEEP_MEDIA_PROOF === '1') {
    const retained = await mkdtemp(join(resolve('.tmp'), 'chabu-video-proof-'));
    await writeFile(join(retained, 'SYNTHETIC_MEDIA.mp4'), bytes, { mode: 0o600, flag: 'wx' });
    await writeFile(join(retained, 'PROVENANCE.txt'), `SYNTHETIC_MEDIA / deterministic local CHABU fixture only. Not Google Flow output.\nDuration=${info.format.duration}s; 720x1280 H.264 + AAC.\n`, { mode: 0o600, flag: 'wx' });
    t.diagnostic(`Synthetic CHABU video proof retained at ${retained}`);
  }
  t.diagnostic(`CHABU SYNTHETIC_MEDIA verified: 4x10s; 720x1280 H.264 + AAC; ${bytes.length} bytes; export reopens unchanged.`);
});
