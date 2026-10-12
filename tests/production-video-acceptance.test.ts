import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { createApplication } from '../server/app.js';
import { createMockProvider } from '../server/ai/mock.js';
import type { AiProvider } from '../server/ai/types.js';
import { flowPrompt } from '../server/project-files.js';
import type { Clip, Job, Project, Scene } from '../shared/contracts.js';
import { EditorSettingsSchema, type AudioAsset, type ImageAsset, type ProductionState } from '../shared/production.js';

const run = promisify(execFile);
const origin = 'http://127.0.0.1:5173';
const credentials = { username: 'synthetic_video_owner', password: 'synthetic-video-test-only-2026' };
const brief = { name: 'MOCK_TEXT / SYNTHETIC_MEDIA acceptance', brief: 'Synthetic offline acceptance story, never a real Google Flow generation.', genre: 'Test story', audience: 'Internal QA', aspectRatio: '16:9' as const, targetDurationSeconds: 20 };

async function payload<T>(response: Response, expectedStatus = 200): Promise<T> {
  assert.equal(response.status, expectedStatus);
  return await response.json() as T;
}

async function fixture(t: TestContext) {
  const root = resolve('.tmp'); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, 'production-video-test-'));
  const mock = createMockProvider(); const calls = { ideas: 0, expansion: 0 };
  // Only this explicit Mock adapter exists in the fixture: no provider router,
  // API key lookup, live-provider adapter, OAuth or cloud connector is constructed.
  const provider: AiProvider = {
    async generateIdeas(input, options) { calls.ideas++; return mock.generateIdeas(input, options); },
    async expandStory(input, selected, options) { calls.expansion++; return mock.expandStory(input, selected, options); },
  };
  let active: { application: ReturnType<typeof createApplication>; server: ReturnType<typeof createServer>; base: string } | null = null;
  let cookie = ''; let csrf = '';
  async function close() {
    const current = active; active = null;
    if (!current) return;
    try { await new Promise<void>((yes, no) => current.server.close(error => error ? no(error) : yes())); }
    finally { await current.application.close(); }
  }
  t.after(async () => { await close(); await rm(dir, { recursive: true, force: true }); });
  async function start() {
    assert.equal(active, null);
    const application = createApplication({ dataDir: dir, provider, startWorker: false, allowedOrigins: [origin], integrations: { aiStatus: () => ({ mode: 'mock', active: 'mock', fallbackReason: null }) } });
    const server = createServer(application.app);
    await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    active = { application, server, base: `http://127.0.0.1:${address.port}/api` };
    return application;
  }
  async function call(path: string, method = 'GET', body?: unknown) {
    assert.ok(active);
    const headers = new Headers(); if (cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') { headers.set('Origin', origin); if (csrf) headers.set('X-CSRF-Token', csrf); }
    let data: string | FormData | undefined;
    if (body instanceof FormData) data = body;
    else if (body !== undefined) { headers.set('Content-Type', 'application/json'); data = JSON.stringify(body); }
    return fetch(`${active.base}${path}`, { method, headers, body: data });
  }
  async function authenticate(path: '/auth/setup' | '/auth/login', status: number) {
    cookie = ''; csrf = '';
    const response = await call(path, 'POST', credentials);
    const auth = await payload<{ csrfToken: string }>(response, status);
    const session = response.headers.get('set-cookie'); assert.ok(session);
    cookie = session.split(';')[0]; csrf = auth.csrfToken;
  }
  async function upload<T>(projectId: string, kind: 'images' | 'audio' | 'clips', field: 'image' | 'audio' | 'clip', path: string, filename: string, type: string, sceneId?: string) {
    const body = new FormData();
    if (sceneId) body.append('sceneId', sceneId);
    body.append(field, new Blob([new Uint8Array(await readFile(path))], { type }), filename);
    return payload<T>(await call(`/projects/${projectId}/${kind}`, 'POST', body), 201);
  }
  return { root, dir, calls, start, close, call, authenticate, upload };
}

async function pixel(path: string, time: number): Promise<number[]> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'crop=20:20:0:0,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', timeout: 30_000, windowsHide: true });
  return [...stdout];
}

async function audioAmplitude(path: string, time: number, frequency: number): Promise<number> {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path, '-t', '0.25', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], { encoding: 'buffer', timeout: 30_000, windowsHide: true });
  const length = stdout.length / 4; assert.ok(length >= 1900);
  let real = 0; let imaginary = 0;
  for (let index = 0; index < length; index++) {
    const sample = stdout.readFloatLE(index * 4); const phase = 2 * Math.PI * frequency * index / 8000;
    real += sample * Math.cos(phase); imaginary += sample * Math.sin(phase);
  }
  return 2 * Math.hypot(real, imaginary) / length;
}

test('MOCK_TEXT + SYNTHETIC_MEDIA: 20-second production API exports real MP4 with references/music/SFX and reopens persisted state', { timeout: 180_000 }, async t => {
  const f = await fixture(t); let application = await f.start();
  await f.authenticate('/auth/setup', 201);
  assert.equal((await f.call('/auth/logout', 'POST')).status, 200);
  await f.authenticate('/auth/login', 200);
  let project = (await payload<{ project: Project }>(await f.call('/projects', 'POST', brief), 201)).project;
  const path = `/projects/${project.id}`;
  assert.equal((await f.call(`${path}/ideas`, 'POST')).status, 202); assert.equal(await application.worker.runNext(), true);
  project = (await payload<{ project: Project }>(await f.call(path))).project;
  assert.equal(project.ideas.length, 10); assert.equal(new Set(project.ideas.map(idea => idea.id)).size, 10);
  const selectedIdeaId = project.ideas[4].id;
  assert.equal((await f.call(`${path}/select`, 'POST', { ideaId: selectedIdeaId })).status, 200);
  assert.equal((await f.call(`${path}/expand`, 'POST')).status, 202); assert.equal(await application.worker.runNext(), true);
  project = (await payload<{ project: Project }>(await f.call(path))).project;
  assert.equal(project.selectedIdeaId, selectedIdeaId); assert.ok(project.package);
  assert.deepEqual(project.generation, { ideas: 'mock', expansion: 'mock' }); assert.equal(project.aiUsage, undefined);
  assert.deepEqual(project.package.scenes.map(scene => scene.durationSeconds), [7, 7, 6]);
  const scenes = project.package.scenes;

  const reference = join(f.dir, 'synthetic-reference.png');
  await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90', '-frames:v', '1', reference], { timeout: 30_000, windowsHide: true });
  const { asset: image } = await f.upload<{ asset: ImageAsset }>(project.id, 'images', 'image', reference, 'SYNTHETIC_MEDIA-reference.png', 'image/png');
  assert.equal(image.width, 160); assert.equal(image.height, 90);
  const imageDownload = await f.call(`${path}/images/${image.id}/file`); assert.equal(imageDownload.status, 200);
  assert.deepEqual(Buffer.from(await imageDownload.arrayBuffer()), await readFile(reference));
  const referenceText = `SYNTHETIC_MEDIA reference image ${image.id}`;
  assert.equal((await f.call(`${path}/production`, 'POST', { scenes: Object.fromEntries(scenes.map(scene => [scene.id, { status: 'ready_for_flow', characterReference: referenceText, locationReference: referenceText, notes: 'ภาพทดสอบเท่านั้น' }])) })).status, 200);
  const production = await payload<{ state: ProductionState; scenes: Array<{ id: string; promptEn: string }> }>(await f.call(`${path}/production`));
  const packResponse = await f.call(`${path}/prompt-pack`); assert.match(packResponse.headers.get('content-disposition') ?? '', /attachment/);
  const promptPack = await payload<{ scenes: Scene[] }>(packResponse);
  for (const scene of scenes) {
    assert.match(scene.explanationTh, /[\u0e00-\u0e7f]/u);
    const prompt = flowPrompt(project, scene, production.state);
    assert.doesNotMatch(prompt, /[\u0e00-\u0e7f]/u); assert.match(prompt, /SYNTHETIC_MEDIA reference image/);
    assert.equal(production.scenes.find(item => item.id === scene.id)?.promptEn, prompt);
    assert.equal(promptPack.scenes.find(item => item.id === scene.id)?.flowPromptEn, prompt);
  }

  const filenames = scenes.map(scene => `${scene.id}.mp4`);
  const matches = await payload<{ matches: Array<{ sceneId: string | null }> }>(await f.call(`${path}/clip-match`, 'POST', { filenames }));
  assert.deepEqual(matches.matches.map(match => match.sceneId), scenes.map(scene => scene.id));
  const colors = ['red', 'green', 'blue'];
  for (const [index, scene] of scenes.entries()) {
    const clipPath = join(f.dir, `synthetic-scene-${index + 1}.mp4`);
    // The visible label prevents retained playback from being confused with Flow
    // output. Clip durations match the actual variable scene plan, not placeholders.
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${colors[index]}:s=320x180:r=30`, '-vf', 'drawtext=text=SYNTHETIC_MEDIA:fontcolor=white:fontsize=14:x=16:y=12', '-t', String(scene.durationSeconds), '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', clipPath], { timeout: 30_000, windowsHide: true });
    const { clip } = await f.upload<{ clip: Clip }>(project.id, 'clips', 'clip', clipPath, filenames[index], 'video/mp4', scene.id);
    assert.equal(clip.sceneId, scene.id); assert.ok(Math.abs(clip.durationSeconds - scene.durationSeconds) < 0.05);
    const download = await f.call(`/clips/${clip.id}/file`); assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), await readFile(clipPath));
  }

  async function audio(frequency: number, name: string) {
    const audioPath = join(f.dir, name);
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000`, '-t', '1', audioPath], { timeout: 30_000, windowsHide: true });
    const result = await f.upload<{ asset: AudioAsset }>(project.id, 'audio', 'audio', audioPath, name, 'audio/wav');
    assert.ok(Math.abs(result.asset.durationSeconds - 1) < 0.05);
    return result.asset;
  }
  const music = await audio(440, 'SYNTHETIC_MEDIA-music.wav');
  const effect = await audio(880, 'SYNTHETIC_MEDIA-sfx.wav');
  const editor = EditorSettingsSchema.parse({ resolution: '720p', quality: 'draft', transition: 'fade', subtitleLocale: 'th', normalizeAudio: false, clipVolume: 0, musicAssetId: music.id, musicVolume: 0.2,
    sceneOrder: [scenes[2].id, scenes[0].id, scenes[1].id], soundEffects: [{ assetId: effect.id, sceneId: scenes[0].id, volume: 0.6 }] });
  assert.equal((await f.call(`${path}/production`, 'POST', { editor })).status, 200);
  project = (await payload<{ project: Project }>(await f.call(path))).project;
  assert.equal(project.status, 'clips_ready'); assert.equal(project.clips.length, 3);
  assert.equal((await f.call(`${path}/ideas`, 'POST')).status, 409);
  assert.equal((await f.call(`${path}/expand`, 'POST')).status, 409);
  const { job: exportJob } = await payload<{ job: Job }>(await f.call(`${path}/export`, 'POST'), 202);
  assert.equal(exportJob.status, 'queued'); assert.equal(exportJob.type, 'export');
  t.diagnostic('MOCK_TEXT / SYNTHETIC_MEDIA: real FFmpeg export queued; no live provider is configured.');
  assert.equal(await application.worker.runNext(), true);
  const jobs = (await payload<{ jobs: Job[] }>(await f.call('/jobs'))).jobs;
  assert.equal(jobs.find(job => job.id === exportJob.id)?.status, 'completed');
  assert.equal(jobs.find(job => job.id === exportJob.id)?.progress, 100);
  assert.deepEqual(jobs.map(job => job.type).sort(), ['expand', 'export', 'ideas']);
  project = (await payload<{ project: Project }>(await f.call(path))).project;
  assert.equal(project.status, 'exported'); assert.ok(project.export);
  const exportUrl = `/exports/${project.export.id}/file`;
  const response = await f.call(exportUrl); assert.equal(response.status, 200); assert.match(response.headers.get('content-type') ?? '', /video\/mp4/);
  const bytes = Buffer.from(await response.arrayBuffer()); assert.ok(bytes.length > 1000);
  const downloaded = join(f.dir, 'SYNTHETIC_MEDIA-downloaded.mp4'); await writeFile(downloaded, bytes);
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', downloaded], { timeout: 30_000, windowsHide: true });
  const info = JSON.parse(stdout) as { format: { duration: string }; streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }> };
  const video = info.streams.find(stream => stream.codec_type === 'video'); const audioStream = info.streams.find(stream => stream.codec_type === 'audio');
  assert.equal(video?.width, 1280); assert.equal(video.height, 720); assert.equal(video.codec_name, 'h264');
  assert.equal(audioStream?.codec_name, 'aac'); assert.ok(Math.abs(Number(info.format.duration) - 20) < 0.15);
  const blue = await pixel(downloaded, 2); const red = await pixel(downloaded, 8); const green = await pixel(downloaded, 16);
  assert.ok(blue[2] > 180 && blue[0] < 40); assert.ok(red[0] > 180 && red[2] < 40); assert.ok(green[1] > 80 && green[0] < 40);
  const musicAmplitude = await audioAmplitude(downloaded, 12, 440);
  const sfxAmplitude = await audioAmplitude(downloaded, 6.3, 880);
  assert.ok(musicAmplitude > 0.015 && musicAmplitude < 0.035, `looped music amplitude ${musicAmplitude}`);
  assert.ok(sfxAmplitude > 0.05 && sfxAmplitude < 0.1, `scene-start SFX amplitude ${sfxAmplitude}`);
  assert.ok(await audioAmplitude(downloaded, 2, 880) < 0.003, 'SFX stays absent before its reordered scene');
  assert.deepEqual(await readdir(join(f.dir, 'tmp')), []);
  const beforeRestart = await payload<{ state: ProductionState }>(await f.call(`${path}/production`));
  assert.equal(beforeRestart.state.images.length, 1); assert.equal(beforeRestart.state.audio.length, 2);

  await f.close(); application = await f.start(); await f.authenticate('/auth/login', 200);
  const reopened = (await payload<{ project: Project }>(await f.call(path))).project;
  assert.deepEqual(reopened, project); assert.equal(reopened.selectedIdeaId, selectedIdeaId); assert.equal(reopened.ideas.length, 10);
  const afterRestart = await payload<{ state: ProductionState }>(await f.call(`${path}/production`));
  assert.deepEqual(afterRestart.state, beforeRestart.state); assert.deepEqual(afterRestart.state.editor, editor);
  const persistedExport = await f.call(exportUrl); assert.equal(persistedExport.status, 200);
  assert.deepEqual(Buffer.from(await persistedExport.arrayBuffer()), bytes);
  const persistedReference = await f.call(`${path}/images/${image.id}/file`); assert.equal(persistedReference.status, 200);
  assert.deepEqual(Buffer.from(await persistedReference.arrayBuffer()), await readFile(reference));
  assert.equal((await f.call(`${path}/audio/${music.id}/file`)).status, 200);
  assert.equal(await application.worker.runNext(), false);
  assert.deepEqual(f.calls, { ideas: 1, expansion: 1 }); assert.equal(reopened.aiUsage, undefined);
  t.diagnostic(`SYNTHETIC_MEDIA verified: duration=${info.format.duration}s; 1280x720 H.264; AAC; MOCK_TEXT calls ideas=1 expansion=1; persisted MP4 unchanged.`);

  // Optional visual proof contains only synthetic media and a provenance marker,
  // never the fixture DB, login state, credentials, or account information.
  if (process.env.ACF_RETAIN_SYNTHETIC_ACCEPTANCE === '1') {
    const retained = await mkdtemp(join(f.root, 'production-video-proof-'));
    await writeFile(join(retained, 'SYNTHETIC_MEDIA.mp4'), bytes, { mode: 0o600, flag: 'wx' });
    await writeFile(join(retained, 'PROVENANCE.txt'), `SYNTHETIC_MEDIA / MOCK_TEXT ONLY. Not Google Flow output or real-provider acceptance.\nDuration=${info.format.duration}s; 1280x720 H.264 + AAC.\nColored scenes, synthetic music/SFX and Thai mock narration subtitles.\n`, { mode: 0o600, flag: 'wx' });
    t.diagnostic(`Synthetic playback proof: ${retained}`);
  }
});
