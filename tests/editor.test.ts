import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assembleExport, managedPath, probeAudio, probeMedia } from '../server/media.js';
import type { Store } from '../server/store.js';
import type { Project, Scene } from '../shared/contracts.js';
import { EditorSettingsSchema } from '../shared/production.js';

const run = promisify(execFile);
const localized = { th: 'สวัสดี เรื่องราวของเรา', en: 'Our story begins' };

async function fixture(t: TestContext) {
  const root = resolve('.tmp');
  await mkdir(root, { recursive: true });
  // Spaces and apostrophe exercise paths independently from FFmpeg filter syntax.
  const dataDir = await mkdtemp(join(root, "editor's media-"));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  await mkdir(join(dataDir, 'clips'));
  const scenes: Scene[] = ['red', 'green', 'blue'].map((id, index) => ({
    id, order: index + 1, title: localized, durationSeconds: 4, explanationTh: 'ฉาก',
    flowPromptEn: 'A scene', narration: localized, characterIds: ['hero'], locationId: 'place',
  }));
  const filenames = new Map<string, string>();
  for (const scene of scenes) {
    const name = `${randomUUID()}.mp4`;
    filenames.set(scene.id, name);
    const args = ['-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${scene.id}:s=64x64:r=30`];
    if (scene.id === 'red') args.push('-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000');
    else args.push('-an');
    args.push('-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
    if (scene.id === 'red') args.push('-c:a', 'aac');
    args.push(managedPath(dataDir, 'clips', name));
    await run('ffmpeg', args);
  }
  const project: Project = {
    id: 'project', name: 'Editor', brief: 'A short story', genre: 'Drama', audience: 'All', aspectRatio: '9:16',
    status: 'clips_ready', createdAt: '', updatedAt: '', ideas: [], selectedIdeaId: 'idea', export: null,
    package: { storyBible: localized, characters: [], locations: [], continuityRules: [], scenes },
    clips: scenes.map(scene => ({ id: scene.id, sceneId: scene.id, projectId: 'project', originalName: 'clip.mp4', durationSeconds: 1, createdAt: '' })),
  };
  // Isolated media unit fixture: the real Store owns authorization; this stand-in
  // enforces the owner/media lookup without opening or changing an application DB.
  const store = {
    dataDir,
    media(owner: string, id: string, kind: string) {
      assert.equal(owner, 'owner'); assert.equal(kind, 'clips');
      const filename = filenames.get(id); assert.ok(filename);
      return { filename };
    },
  } as unknown as Store;
  return { dataDir, store, project };
}

async function pixel(path: string, time: number) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'crop=20:20,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer' });
  return [...stdout];
}

async function samples(path: string, time: number) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', String(time), '-i', path, '-t', '0.25', '-vn', '-ac', '1', '-ar', '8000', '-f', 'f32le', 'pipe:1'], { encoding: 'buffer' });
  return Array.from({ length: stdout.length / 4 }, (_, index) => stdout.readFloatLE(index * 4));
}

function amplitude(values: number[], frequency: number) {
  let real = 0; let imaginary = 0;
  values.forEach((value, index) => {
    const phase = 2 * Math.PI * frequency * index / 8000;
    real += value * Math.cos(phase); imaginary += value * Math.sin(phase);
  });
  return 2 * Math.hypot(real, imaginary) / values.length;
}

async function assertDimensions(path: string, width: number, height: number) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', path]);
  assert.deepEqual(JSON.parse(stdout).streams[0], { width, height });
  const info = await probeMedia(path);
  assert.ok(Math.abs(info.duration - 12) < 0.15, `duration ${info.duration}`);
  assert.equal(info.hasAudio, true);
}

async function assertSubtitles(path: string, width: number, height: number) {
  const { stdout } = await run('ffmpeg', ['-v', 'error', '-ss', '1', '-i', path, '-frames:v', '1', '-vf', `crop=${width}:${Math.floor(height / 4)}:0:${Math.floor(height * 3 / 4)}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
  let white = 0;
  for (let index = 0; index < stdout.length; index += 3) if (stdout[index] > 180 && stdout[index + 1] > 180 && stdout[index + 2] > 180) white++;
  assert.ok(white > 150, `visible subtitle pixels ${white}`);
}

test('720p portrait export obeys complete scene order, pads short/silent clips and burns English narration', { timeout: 180_000 }, async t => {
  const f = await fixture(t);
  const output = await assembleExport(f.store, 'owner', f.project, new AbortController().signal, {
    settings: EditorSettingsSchema.parse({ resolution: '720p', quality: 'draft', sceneOrder: ['blue', 'red', 'green'], subtitleLocale: 'en', normalizeAudio: false, clipVolume: 0.25 }),
  });
  const path = managedPath(f.dataDir, 'exports', output);
  await assertDimensions(path, 720, 1280);
  const blue = await pixel(path, 2); const red = await pixel(path, 6); const green = await pixel(path, 10);
  assert.ok(blue[2] > 200 && blue[0] < 30); assert.ok(red[0] > 200 && red[2] < 30); assert.ok(green[1] > 90 && green[0] < 30);
  await assertSubtitles(path, 720, 1280);
  assert.ok(amplitude(await samples(path, 0.3), 220) < 0.001);
  const clipAmplitude = amplitude(await samples(path, 4.3), 220);
  assert.ok(clipAmplitude > 0.02 && clipAmplitude < 0.04, `clip volume ${clipAmplitude}`);
  assert.ok(amplitude(await samples(path, 6), 220) < 0.001, 'short clip audio is padded with silence');
  assert.deepEqual(await readdir(join(f.dataDir, 'tmp')), []);
});

test('720p landscape fades preserve duration, burn Thai subtitles and mix looped music/SFX at reordered offsets', { timeout: 180_000 }, async t => {
  const f = await fixture(t);
  f.project.aspectRatio = '16:9';
  const music = join(f.dataDir, 'music.wav'); const effect = join(f.dataDir, 'effect.wav');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '0.5', music]);
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000', '-t', '1', effect]);
  const output = await assembleExport(f.store, 'owner', f.project, new AbortController().signal, {
    settings: EditorSettingsSchema.parse({ resolution: '720p', sceneOrder: ['blue', 'red', 'green'], transition: 'fade', subtitleLocale: 'th', clipVolume: 0,
      musicAssetId: randomUUID(), musicVolume: 0.2, soundEffects: [{ assetId: randomUUID(), sceneId: 'red', volume: 0.8 }] }),
    music: { path: music }, effects: [{ path: effect, sceneId: 'red', volume: 0.8 }],
  });
  const path = managedPath(f.dataDir, 'exports', output);
  await assertDimensions(path, 1280, 720);
  await assertSubtitles(path, 1280, 720);
  assert.ok((await pixel(path, 0)).every(value => value < 10), 'first fade frame is black');
  assert.ok((await pixel(path, 4.05))[0] < 130, 'scene boundary fades through black');
  for (const time of [2, 6, 10]) {
    const values = await samples(path, time);
    const musicAmplitude = amplitude(values, 440);
    assert.ok(musicAmplitude > 0.015 && musicAmplitude < 0.035, `looped music at ${time}: ${musicAmplitude}`);
    assert.ok(amplitude(values, 880) < 0.003, 'SFX absent outside its scene-start window');
  }
  const values = await samples(path, 4.3);
  assert.ok(amplitude(values, 880) > 0.075 && amplitude(values, 880) < 0.12, 'SFX begins at reordered second scene');
  assert.ok(amplitude(values, 220) < 0.001, 'clipVolume zero mutes original clip audio');
});

test('audio probe accepts supported containers and rejects malformed, video, network and overlong media privately', async t => {
  const f = await fixture(t);
  for (const extension of ['mp3', 'm4a', 'wav', 'ogg']) {
    const path = join(f.dataDir, `tone.${extension}`);
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '0.25', path]);
    assert.ok((await probeAudio(path)).duration > 0.2);
  }
  const invalid = join(f.dataDir, 'invalid.wav'); await writeFile(invalid, 'private malformed data');
  const disguised = join(f.dataDir, 'video.m4a');
  await copyFile(managedPath(f.dataDir, 'clips', f.store.media('owner', 'red', 'clips').filename), disguised);
  for (const path of [invalid, disguised, 'https://example.com/private.wav', join(f.dataDir, 'absent.wav'), managedPath(f.dataDir, 'clips', f.store.media('owner', 'red', 'clips').filename)]) {
    await assert.rejects(probeAudio(path), { code: 'INVALID_MEDIA', message: 'INVALID_MEDIA' });
  }
  const long = join(f.dataDir, 'long.wav');
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '3601', '-c:a', 'pcm_u8', long]);
  await assert.rejects(probeAudio(long), { code: 'INVALID_MEDIA' });
});

test('editor rejects invalid settings/order and cancellation removes all intermediate files', async t => {
  const f = await fixture(t);
  for (const sceneOrder of [['red', 'red', 'green'], ['red', 'green'], ['red', 'blue', 'unknown']]) {
    await assert.rejects(assembleExport(f.store, 'owner', f.project, new AbortController().signal, { settings: EditorSettingsSchema.parse({ sceneOrder }) }), { code: 'INVALID_INPUT' });
  }
  const settings = EditorSettingsSchema.parse({}); settings.clipVolume = Number.NaN;
  await assert.rejects(assembleExport(f.store, 'owner', f.project, new AbortController().signal, { settings }), { code: 'INVALID_INPUT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(assembleExport(f.store, 'owner', f.project, controller.signal), { code: 'INTERRUPTED' });
  assert.deepEqual(await readdir(join(f.dataDir, 'tmp')), []);
  assert.deepEqual(await readdir(join(f.dataDir, 'exports')), []);
  const rendering = new AbortController();
  const timer = setTimeout(() => rendering.abort(), 300);
  try {
    await assert.rejects(assembleExport(f.store, 'owner', f.project, rendering.signal), { code: 'INTERRUPTED' });
  } finally { clearTimeout(timer); }
  assert.deepEqual(await readdir(join(f.dataDir, 'tmp')), []);
  assert.deepEqual(await readdir(join(f.dataDir, 'exports')), []);
});
