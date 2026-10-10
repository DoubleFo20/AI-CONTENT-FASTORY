import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProjectStorage, type ManagedProjectMedia } from '../server/storage/projects.js';
import { DriveError, type DriveIntegration, type DriveMedia, type DriveUpload, type DriveErrorCode } from '../server/storage/types.js';

const owner = 'c230af16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const otherOwner = 'd1caaf16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const project = { id: 'ad385bdc-e412-45fd-87ac-f31be55e7c8d', name: 'Storage QA' };
const folders = { rootId: 'root_folder', projectFolderId: 'project_folder', categories: {
  story: 'story', productReview: 'product', kidsToy: 'kids', investment: 'investment', sharedAssets: 'assets', archives: 'archives',
} };
const digest = (bytes: Uint8Array) => createHash('md5').update(bytes).digest('hex');
const fails = (expected: DriveErrorCode) => (error: unknown) => {
  assert(error instanceof DriveError); assert.equal(error.code, expected); assert.equal(error.message, expected); return true;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
async function fixture(t: TestContext) {
  const base = join(process.cwd(), '.tmp'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'project-storage-')); const privateDir = join(directory, 'private-index');
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const uploads: DriveUpload[] = []; const downloads: string[] = [];
  let preparations = 0;
  const binary = new Uint8Array([1, 2, 3]);
  const success = async (input: DriveUpload): Promise<DriveMedia> => {
    const bytes = input.filePath ? await readFile(input.filePath) : input.bytes!;
    return { id: `drive_${input.idempotencyKey!.replace(/:/gu, '_')}`, name: input.name, mimeType: input.mimeType, size: bytes.length, md5Checksum: digest(bytes), verified: true };
  };
  const control = { upload: async (input: DriveUpload) => {
    const result = await success(input); input.onProgress?.(0, result.size); input.onProgress?.(result.size, result.size); return result;
  }, download: async () => binary };
  const drive: DriveIntegration = {
    async status() { return { provider: 'google_drive', configured: true, connected: true, state: 'connected' }; },
    async begin() { return { authorizationUrl: 'https://example.invalid/synthetic' }; }, async callback() {},
    async ensureProjectFolders(id, projectId, name) { assert.equal(id, owner); assert.equal(projectId, project.id); assert.equal(name, project.name); preparations++; return structuredClone(folders); },
    async upload(id, input) { assert.equal(id, owner); uploads.push(input); return control.upload(input); },
    async download(id, fileId) { assert.equal(id, owner); downloads.push(fileId); return control.download(); },
  };
  const makeMedia = async (kind: ManagedProjectMedia['kind'] = 'clips', sceneId = 'scene_1'): Promise<ManagedProjectMedia> => {
    const id = randomUUID(); const filePath = join(directory, `${id}.mp4`); await writeFile(filePath, binary);
    return { id, kind, filePath, name: `${sceneId}__${id}.mp4`, mimeType: 'video/mp4', sceneId };
  };
  const storage = new ProjectStorage({ privateDir, drive });
  return { directory, privateDir, binary, drive, storage, uploads, downloads, control, success, makeMedia, get preparations() { return preparations; } };
}

test('explicit preparation is idempotent and state never requests remote work on its own', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.storage.state(owner, project.id), { projectId: project.id, prepared: false, folders: null, transfers: [], summary: { total: 0, active: 0, completed: 0, failed: 0 } });
  assert.equal(f.preparations, 0);
  const [first, second] = await Promise.all([f.storage.prepare(owner, project), f.storage.prepare(owner, project)]);
  assert.deepEqual(first, second); assert.equal(first.prepared, true); assert.deepEqual(first.folders, folders);
  assert.equal(f.preparations, 1);
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.equal(restart.state(owner, project.id).prepared, true);
  await restart.prepare(owner, project); assert.equal(f.preparations, 1); assert.equal(f.uploads.length, 0);
});

test('three successes and one failure produce a private durable index with sanitized aggregate state', async t => {
  const f = await fixture(t); const media = await Promise.all(['clips', 'exports', 'audio', 'images'].map(kind => f.makeMedia(kind as ManagedProjectMedia['kind'])));
  f.control.upload = async input => {
    if (input.idempotencyKey!.startsWith('audio:')) throw new Error('private provider detail D:/secret/path token');
    const result = await f.success(input); input.onProgress?.(3, 3); return result;
  };
  const admitted = await Promise.all(media.map(item => f.storage.start(owner, project, item)));
  assert(admitted.every(info => info.status === 'queued'));
  await f.storage.wait();
  const state = f.storage.state(owner, project.id);
  assert.deepEqual(state.summary, { total: 4, active: 0, completed: 3, failed: 1 });
  assert.equal(state.transfers.find(info => info.kind === 'audio')?.errorCode, 'DRIVE_REQUEST_FAILED');
  assert(state.transfers.filter(info => info.status === 'completed').every(info => info.progress === 100 && info.file?.verified && info.file.md5Checksum));
  assert(!JSON.stringify(state).includes(f.directory)); assert(!JSON.stringify(state).includes('private provider detail'));
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.deepEqual(restart.state(owner, project.id), state); assert.equal(f.uploads.length, 4);
  assert(f.uploads.every(input => input.project?.id === project.id && input.idempotencyKey?.includes(':') && !input.parentId));
});

test('start returns while upload waits, duplicate starts reuse one transfer, and progress persistence is synchronous and monotonic', async t => {
  const f = await fixture(t); const media = await f.makeMedia(); const entered = deferred<void>(); const done = deferred<DriveMedia>();
  f.control.upload = async () => { entered.resolve(); return done.promise; };
  const first = await f.storage.start(owner, project, media); await entered.promise;
  const second = await f.storage.start(owner, project, media);
  assert.equal(first.id, second.id); assert.equal(f.uploads.length, 1);
  const observer = f.uploads[0].onProgress!;
  assert.equal(observer(2, 3), undefined);
  assert.equal(f.storage.state(owner, project.id).transfers[0].bytes, 2);
  observer(1, 3); observer(-1, 3); observer(3, 999); observer(Number.NaN, 3);
  assert.equal(f.storage.state(owner, project.id).transfers[0].bytes, 2);
  observer(3, 3); assert.equal(f.storage.state(owner, project.id).transfers[0].progress, 99);
  done.resolve(await f.success(f.uploads[0])); await f.storage.wait();
  const terminal = f.storage.state(owner, project.id); observer(0, 3); observer(2, 3);
  assert.deepEqual(f.storage.state(owner, project.id), terminal);
});

test('completed cache is reused only for unchanged media identity, path and content', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait();
  const first = f.storage.state(owner, project.id).transfers[0];
  assert.deepEqual(await f.storage.start(owner, project, media), first); assert.equal(f.uploads.length, 1);
  const otherPath = join(f.directory, 'same-content.mp4'); await writeFile(otherPath, f.binary);
  await assert.rejects(f.storage.start(owner, project, { ...media, filePath: otherPath }), fails('DRIVE_INVALID_INPUT'));
  await writeFile(media.filePath, new Uint8Array([4, 5, 6]));
  await assert.rejects(f.storage.start(owner, project, media), fails('DRIVE_INVALID_INPUT'));
  assert.equal(f.uploads.length, 1);
});

test('failed transfer retries explicitly with the same transfer ID and adapter idempotency key', async t => {
  const f = await fixture(t); const media = await f.makeMedia(); let failure = true;
  f.control.upload = async input => { if (failure) throw new DriveError('DRIVE_TIMEOUT'); return f.success(input); };
  const first = await f.storage.start(owner, project, media); await f.storage.wait();
  assert.equal(f.storage.state(owner, project.id).transfers[0].errorCode, 'DRIVE_TIMEOUT');
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.equal(restart.state(owner, project.id).transfers[0].status, 'failed'); await restart.wait(); assert.equal(f.uploads.length, 1);
  failure = false;
  const retry = await restart.start(owner, project, media); assert.equal(retry.id, first.id); await restart.wait();
  assert.equal(restart.state(owner, project.id).transfers[0].status, 'completed');
  assert.equal(f.uploads[0].idempotencyKey, f.uploads[1].idempotencyKey);
});

test('restart interrupts queued/running without auto replay and old callbacks cannot overwrite a retry attempt', async t => {
  const f = await fixture(t); const media = await f.makeMedia(); const firstEntered = deferred<void>(); const secondEntered = deferred<void>();
  const old = deferred<DriveMedia>(); const fresh = deferred<DriveMedia>();
  f.control.upload = async () => { if (f.uploads.length === 1) { firstEntered.resolve(); return old.promise; } secondEntered.resolve(); return fresh.promise; };
  const first = await f.storage.start(owner, project, media); await firstEntered.promise;
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.equal(restart.state(owner, project.id).transfers[0].errorCode, 'INTERRUPTED'); assert.equal(f.uploads.length, 1);
  const retry = await restart.start(owner, project, media); assert.equal(retry.id, first.id); await secondEntered.promise;
  f.uploads[0].onProgress?.(3, 3);
  assert.equal(restart.state(owner, project.id).transfers[0].bytes, 0);
  old.resolve(await f.success(f.uploads[0])); await f.storage.wait();
  assert.equal(restart.state(owner, project.id).transfers[0].status, 'running');
  fresh.resolve(await f.success(f.uploads[1])); await restart.wait();
  assert.equal(restart.state(owner, project.id).transfers[0].status, 'completed');
  const filename = join(f.privateDir, (await readdir(f.privateDir)).find(name => name.endsWith('.json'))!);
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  manifest.records[0].info.status = 'queued'; manifest.records[0].info.bytes = 0; manifest.records[0].info.progress = 0; delete manifest.records[0].info.file;
  await writeFile(filename, JSON.stringify(manifest));
  const queuedRestart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.equal(queuedRestart.state(owner, project.id).transfers[0].errorCode, 'INTERRUPTED');
  assert.equal(f.uploads.length, 2);
});

test('unverified, wrong checksum, wrong size or wrong file identity never becomes a completed index entry', async t => {
  for (const override of [{ verified: false }, { md5Checksum: undefined }, { md5Checksum: '0'.repeat(32) }, { size: 4 }, { name: 'another.mp4' }]) {
    const f = await fixture(t); const media = await f.makeMedia();
    f.control.upload = async input => ({ ...await f.success(input), ...override });
    await f.storage.start(owner, project, media); await f.storage.wait();
    const transfer = f.storage.state(owner, project.id).transfers[0];
    assert.equal(transfer.status, 'failed'); assert.equal(transfer.errorCode, 'DRIVE_INVALID_OUTPUT'); assert.equal(transfer.file, undefined);
  }
});

test('owner/project-bound records reject aliasing and cannot restore another owner media', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait();
  assert.equal(f.storage.state(otherOwner, project.id).transfers.length, 0);
  await assert.rejects(f.storage.restore(otherOwner, project.id, media.kind, media.id, join(f.directory, 'foreign.mp4')), fails('DRIVE_NOT_FOUND'));
  assert.equal(f.downloads.length, 0);
  const filename = join(f.privateDir, (await readdir(f.privateDir)).find(name => name.endsWith('.json'))!);
  const foreign = join(f.privateDir, `${createHash('sha256').update(`${otherOwner}:${project.id}`).digest('hex')}.json`);
  await writeFile(foreign, await readFile(filename));
  assert.throws(() => new ProjectStorage({ privateDir: f.privateDir, drive: f.drive }).state(otherOwner, project.id), fails('DRIVE_VAULT_FAILED'));
});

test('restore verifies indexed SHA256/MD5/size and atomically caches only missing local files', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait();
  await rm(media.filePath);
  await f.storage.restore(owner, project.id, media.kind, media.id, media.filePath);
  assert.deepEqual(new Uint8Array(await readFile(media.filePath)), f.binary); assert.equal(f.downloads.length, 1);
  await f.storage.restore(owner, project.id, media.kind, media.id, media.filePath); assert.equal(f.downloads.length, 1);
  await writeFile(media.filePath, new Uint8Array([8, 8, 8]));
  await assert.rejects(f.storage.restore(owner, project.id, media.kind, media.id, media.filePath), fails('DRIVE_INVALID_INPUT'));
  assert.deepEqual(new Uint8Array(await readFile(media.filePath)), new Uint8Array([8, 8, 8]));
  assert.equal(f.downloads.length, 1);
});

test('corrupt download and a competing local file are rejected without overwrite or leftover temporary cache files', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait(); const destination = join(f.directory, 'missing.mp4');
  f.control.download = async () => new Uint8Array([9, 9, 9]);
  await assert.rejects(f.storage.restore(owner, project.id, media.kind, media.id, destination), fails('DRIVE_INVALID_OUTPUT'));
  assert(!((await readdir(f.directory)).includes('missing.mp4')));
  f.control.download = async () => { await writeFile(destination, new Uint8Array([8, 8, 8])); return f.binary; };
  await assert.rejects(f.storage.restore(owner, project.id, media.kind, media.id, destination), fails('DRIVE_INVALID_INPUT'));
  assert.deepEqual(new Uint8Array(await readFile(destination)), new Uint8Array([8, 8, 8]));
  assert(!((await readdir(f.directory)).some(name => name.endsWith('.tmp'))));
});

test('missing folder capability and unsafe input stay unprepared, with safe errors and no upload', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  const disabled = new ProjectStorage({ privateDir: f.privateDir, drive: { ...f.drive, ensureProjectFolders: undefined } });
  await assert.rejects(disabled.prepare(owner, project), fails('DRIVE_NOT_CONFIGURED'));
  assert.equal(disabled.state(owner, project.id).prepared, false);
  await disabled.start(owner, project, media); await disabled.wait();
  assert.equal(disabled.state(owner, project.id).transfers[0].errorCode, 'DRIVE_NOT_CONFIGURED');
  assert.equal(f.uploads.length, 0);
  await assert.rejects(disabled.start(owner, project, { ...media, filePath: '../untrusted.mp4' }), fails('DRIVE_INVALID_INPUT'));
  await assert.rejects(disabled.start(owner, project, { ...media, id: '../invalid' }), fails('DRIVE_INVALID_INPUT'));
  assert.throws(() => disabled.state('../invalid', project.id), fails('DRIVE_INVALID_INPUT'));
});

test('bounded stop interrupts a hanging adapter, aborts upload and fences late completion/progress', async t => {
  const f = await fixture(t); const media = await f.makeMedia(); const entered = deferred<void>(); const late = deferred<DriveMedia>();
  f.control.upload = async () => { entered.resolve(); return late.promise; };
  await f.storage.start(owner, project, media); await entered.promise;
  f.uploads[0].onProgress?.(2, 3);
  const waiting = f.storage.wait(); const timestamp = Date.now();
  await f.storage.stop(20); await waiting;
  assert(Date.now() - timestamp < 1000); assert.equal(f.uploads[0].signal?.aborted, true);
  const terminal = f.storage.state(owner, project.id);
  assert.equal(terminal.transfers[0].status, 'failed'); assert.equal(terminal.transfers[0].errorCode, 'INTERRUPTED');
  assert.equal(terminal.transfers[0].bytes, 2); assert.equal(terminal.transfers[0].file, undefined);
  f.uploads[0].onProgress?.(3, 3); late.resolve(await f.success(f.uploads[0]));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(f.storage.state(owner, project.id), terminal);
  await assert.rejects(f.storage.start(owner, project, media), fails('DRIVE_REQUEST_FAILED'));
  await assert.rejects(f.storage.prepare(owner, project), fails('DRIVE_REQUEST_FAILED'));
  await f.storage.stop();
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.deepEqual(restart.state(owner, project.id), terminal); await restart.wait(); assert.equal(f.uploads.length, 1);
  f.control.upload = f.success;
  const retry = await restart.start(owner, project, media); assert.equal(retry.id, terminal.transfers[0].id);
  await restart.wait(); assert.equal(restart.state(owner, project.id).transfers[0].status, 'completed');
  assert.equal(f.uploads[0].idempotencyKey, f.uploads[1].idempotencyKey);
});

test('hanging preparation and all admitted transfers are interrupted without late folder persistence or remote replay', async t => {
  const f = await fixture(t); const entered = deferred<void>(); const late = deferred<typeof folders>();
  let signal: AbortSignal | undefined; let calls = 0;
  f.drive.ensureProjectFolders = async (_owner, _project, _name, options) => { calls++; signal = options?.signal; entered.resolve(); return late.promise; };
  const preparation = f.storage.prepare(owner, project); const rejected = assert.rejects(preparation, fails('DRIVE_REQUEST_FAILED'));
  await entered.promise;
  const media = await Promise.all([f.makeMedia(), f.makeMedia('audio'), f.makeMedia('images')]);
  await Promise.all(media.map(item => f.storage.start(owner, project, item)));
  assert.equal(f.storage.state(owner, project.id).summary.active, 3);
  await f.storage.stop(10); await rejected; await f.storage.wait();
  assert.equal(signal?.aborted, true); assert.equal(calls, 1); assert.equal(f.uploads.length, 0);
  const terminal = f.storage.state(owner, project.id);
  assert.deepEqual(terminal.summary, { total: 3, active: 0, completed: 0, failed: 3 });
  assert(terminal.transfers.every(info => info.errorCode === 'INTERRUPTED')); assert.equal(terminal.prepared, false);
  late.resolve(folders); await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(f.storage.state(owner, project.id), terminal);
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.deepEqual(restart.state(owner, project.id), terminal); await restart.wait(); assert.equal(calls, 1);
});

test('stop rejects queued admissions before fingerprint/upload and graceful drain preserves completed work', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  const admissions = Promise.allSettled(Array.from({ length: 10 }, () => f.storage.start(owner, project, media)));
  await f.storage.stop(0);
  assert((await admissions).every(result => result.status === 'rejected' && result.reason instanceof DriveError && result.reason.code === 'DRIVE_REQUEST_FAILED'));
  assert.equal(f.uploads.length, 0); assert.equal(f.preparations, 0); assert.equal(f.storage.state(owner, project.id).transfers.length, 0);
  const g = await fixture(t); const next = await g.makeMedia(); const entered = deferred<void>(); const finish = deferred<DriveMedia>();
  g.control.upload = async () => { entered.resolve(); return finish.promise; };
  await g.storage.start(owner, project, next); await entered.promise;
  const stopping = g.storage.stop(1000);
  await assert.rejects(g.storage.start(owner, project, next), fails('DRIVE_REQUEST_FAILED'));
  finish.resolve(await g.success(g.uploads[0])); await stopping;
  assert.equal(g.storage.state(owner, project.id).transfers[0].status, 'completed');
  assert.equal(g.uploads.length, 1); await g.storage.wait();
});

test('stop bounds a hanging restore, aborts download and never publishes late bytes or retries remotely', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait(); await rm(media.filePath);
  const entered = deferred<void>(); const late = deferred<Uint8Array>(); let signal: AbortSignal | undefined;
  f.drive.download = async (id, fileId, options) => {
    assert.equal(id, owner); f.downloads.push(fileId); signal = options?.signal; entered.resolve(); return late.promise;
  };
  await assert.rejects(f.storage.restore(otherOwner, project.id, media.kind, media.id, media.filePath), fails('DRIVE_NOT_FOUND'));
  assert.equal(f.downloads.length, 0);
  const restoring = f.storage.restore(owner, project.id, media.kind, media.id, media.filePath);
  const rejected = assert.rejects(restoring, fails('DRIVE_REQUEST_FAILED')); await entered.promise;
  const waiting = f.storage.wait(); const timestamp = Date.now(); await f.storage.stop(20); await Promise.all([waiting, rejected]);
  assert(Date.now() - timestamp < 1000); assert.equal(signal?.aborted, true); assert.equal(f.downloads.length, 1);
  late.resolve(f.binary); await new Promise<void>(resolve => setImmediate(resolve));
  assert(!((await readdir(f.directory)).includes(`${media.id}.mp4`)));
  assert(!((await readdir(f.directory)).some(name => name.endsWith('.tmp'))));
  await assert.rejects(f.storage.restore(owner, project.id, media.kind, media.id, media.filePath), fails('DRIVE_REQUEST_FAILED'));
  const restart = new ProjectStorage({ privateDir: f.privateDir, drive: f.drive });
  assert.equal(restart.state(owner, project.id).transfers[0].status, 'completed'); await restart.wait(); assert.equal(f.downloads.length, 1);
});

test('graceful stop waits for an admitted restore and completed calls remove their shutdown listeners', async t => {
  const f = await fixture(t); const media = await f.makeMedia();
  await f.storage.start(owner, project, media); await f.storage.wait();
  const signal = f.uploads[0].signal!;
  for (let count = 0; count < 25; count++) {
    await f.storage.start(owner, project, media); await f.storage.prepare(owner, project); await f.storage.wait();
  }
  assert.equal(getEventListeners(signal, 'abort').length, 0);
  await rm(media.filePath); const entered = deferred<void>(); const downloaded = deferred<Uint8Array<ArrayBuffer>>();
  f.control.download = async () => { entered.resolve(); return downloaded.promise; };
  const restoring = f.storage.restore(owner, project.id, media.kind, media.id, media.filePath); await entered.promise;
  const stopping = f.storage.stop(1000); assert(getEventListeners(signal, 'abort').length > 0);
  downloaded.resolve(f.binary); await Promise.all([restoring, stopping]);
  assert.deepEqual(new Uint8Array(await readFile(media.filePath)), f.binary);
  assert.equal(getEventListeners(signal, 'abort').length, 0); assert.equal(f.downloads.length, 1);
});
