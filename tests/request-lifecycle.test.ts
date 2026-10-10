import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import childProcess, { type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { syncBuiltinESMExports } from 'node:module';
import { createServer, request } from 'node:http';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createApplication } from '../server/app.js';
import { createMockProvider } from '../server/ai/mock.js';
import { RequestLifecycle } from '../server/request-lifecycle.js';
import { AppError } from '../server/errors.js';
import { probeImage } from '../server/images.js';
import { ProjectFiles } from '../server/project-files.js';
import type { DriveIntegration, SessionValidator } from '../server/storage/types.js';

const origin = 'http://127.0.0.1:5173';
const credentials = { username: 'lifecycle_owner', password: 'synthetic-lifecycle-password-2026' };
const brief = { name: 'Lifecycle QA', brief: 'A traveler returns a lost umbrella to its owner.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' as const };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
const tick = () => new Promise<void>(yes => setImmediate(yes));
async function fixture(t: TestContext, drive?: DriveIntegration) {
  const root = resolve('.tmp'); await mkdir(root, { recursive: true }); const dataDir = await mkdtemp(join(root, 'request-lifecycle-'));
  const application = createApplication({ dataDir, provider: createMockProvider(), allowedOrigins: [origin], startWorker: false, requestDrainMs: 30, integrations: { drive } });
  const server = createServer(application.app); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  const address = server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}/api`;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(yes => server.close(() => yes())); await application.close(); await rm(dataDir, { recursive: true, force: true }); });
  const json = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { application, server, dataDir, base, json };
}
async function loginOwner(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await f.json('/auth/setup', credentials); assert.equal(response.status, 201);
  const body = await response.json() as { csrfToken: string; user: { id: string } };
  return { ownerId: body.user.id, cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: body.csrfToken };
}
function delayScrypt(t: TestContext) {
  const entered = deferred<void>(); const callbacks: Array<(error: Error | null, key: Buffer) => void> = [];
  t.mock.method(crypto, 'scrypt', (...args: unknown[]) => { callbacks.push(args.at(-1) as (error: Error | null, key: Buffer) => void); entered.resolve(); });
  syncBuiltinESMExports(); t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return { entered, finish: (bytes = Buffer.alloc(64)) => { for (const callback of callbacks.splice(0)) callback(null, bytes); } };
}

test('facade preserves Express settings/chaining and drain follows actual handlers after response completion', async () => {
  const lifecycle = new RequestLifecycle(); const original = express(); const routes = lifecycle.routes(original); const finished = deferred<void>();
  original.set('synthetic-setting', 'value'); assert.equal(routes.get('synthetic-setting'), 'value');
  assert.equal(routes.get('/tracked', async (_req, res) => { res.end('ok'); await finished.promise; }), routes);
  const server = createServer(routes); await new Promise<void>(yes => server.listen(0, '127.0.0.1', yes));
  try {
    const address = server.address(); assert(address && typeof address !== 'string');
    assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/tracked`)).text(), 'ok');
    const began = performance.now(); await lifecycle.drain(25); assert(performance.now() - began >= 15);
    finished.resolve(); await lifecycle.drain(1000);
    for (let count = 0; count < 25; count++) assert.equal(await lifecycle.race(Promise.resolve(count)), count);
    assert.equal(getEventListeners(lifecycle.signal, 'abort').length, 0);
  } finally { finished.resolve(); server.closeAllConnections(); await new Promise<void>(yes => server.close(() => yes())); }
});

test('shutdown cancels delayed setup hashing and late scrypt cannot create an owner or session', async t => {
  const f = await fixture(t); const delayed = delayScrypt(t); let owners = 0; let sessions = 0;
  t.mock.method(f.application.store, 'createOwner', () => { owners++; throw new Error('Unexpected owner commit'); });
  t.mock.method(f.application.store, 'createSession', () => { sessions++; });
  const response = f.json('/auth/setup', credentials); await delayed.entered.promise;
  const began = performance.now(); await f.application.close(); assert(performance.now() - began < 1000);
  assert.equal((await response).status, 503); delayed.finish(); await tick();
  assert.equal(owners, 0); assert.equal(sessions, 0);
  assert.equal((await fetch(`${f.base}/auth/status`)).status, 503);
});

test('shutdown cancels delayed login verification before successful session issuance', async t => {
  const f = await fixture(t); await loginOwner(f);
  const expected = Buffer.from(f.application.store.credentials(credentials.username)!.passwordHash.split(':')[2], 'hex');
  const delayed = delayScrypt(t); let sessions = 0; t.mock.method(f.application.store, 'createSession', () => { sessions++; });
  const response = f.json('/auth/login', credentials); await delayed.entered.promise; await f.application.close();
  const result = await response; assert.equal(result.status, 503); assert.equal(result.headers.get('set-cookie'), null);
  delayed.finish(expected); await tick(); assert.equal(sessions, 0);
});

test('JSON body finishing after Store closure is rejected before auth middleware reads the Store', async t => {
  const f = await fixture(t); const session = await loginOwner(f); const entered = deferred<void>();
  const guard = f.application.lifecycle.guard.bind(f.application.lifecycle);
  t.mock.method(f.application.lifecycle, 'guard', () => { entered.resolve(); guard(); });
  let reads = 0; const read = f.application.store.session.bind(f.application.store);
  t.mock.method(f.application.store, 'session', (hash: string) => { reads++; return read(hash); });
  const body = JSON.stringify(brief); const done = deferred<number>();
  const client = request(`${f.base}/projects`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => { res.resume(); done.resolve(res.statusCode!); });
  client.on('error', () => done.resolve(-1)); client.write(body.slice(0, 1)); await entered.promise;
  await f.application.close(); client.end(body.slice(1)); assert.equal(await done.promise, 503); assert.equal(reads, 0);
});

test('clip probe is aborted and a delayed successful probe cannot write after Store closure; own upload is removed', async t => {
  const f = await fixture(t); const session = await loginOwner(f); const store = f.application.store;
  const project = store.createProject(session.ownerId, brief);
  store.enqueue(session.ownerId, project.id, 'ideas'); await f.application.worker.runNext();
  store.select(session.ownerId, project.id, store.project(session.ownerId, project.id).ideas[0].id);
  store.enqueue(session.ownerId, project.id, 'expand'); await f.application.worker.runNext();
  const sceneId = store.project(session.ownerId, project.id).package!.scenes[0].id;
  const entered = deferred<void>(); const child = new EventEmitter() as ChildProcess; const stdout = new PassThrough(); let killed = 0; let writes = 0;
  Object.assign(child, { stdout, kill() { killed++; return true; } });
  t.mock.method(childProcess, 'spawn', () => { entered.resolve(); return child; }); syncBuiltinESMExports();
  t.after(() => { child.emit('close', 0); t.mock.restoreAll(); syncBuiltinESMExports(); });
  t.mock.method(store, 'addClip', () => { writes++; throw new Error('Unexpected clip commit'); });
  const body = new FormData(); body.set('sceneId', sceneId); body.set('clip', new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' }), 'synthetic.mp4');
  const response = fetch(`${f.base}/projects/${project.id}/clips`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf }, body });
  await entered.promise; const began = performance.now(); await f.application.close(); assert(performance.now() - began < 1000); assert.equal(killed, 1);
  stdout.write(JSON.stringify({ format: { duration: '3' }, streams: [{ codec_type: 'video', width: 100, height: 100 }] })); child.emit('close', 0);
  assert.equal((await response).status, 503); await tick();
  assert.equal(writes, 0); assert.deepEqual(await readdir(join(f.dataDir, 'clips')), []);
});

test('multipart shutdown tracks parser cleanup and removes a partial upload without admitting catalog work', async t => {
  const f = await fixture(t); const session = await loginOwner(f); const project = f.application.store.createProject(session.ownerId, brief);
  f.application.store.enqueue(session.ownerId, project.id, 'ideas'); await f.application.worker.runNext();
  f.application.store.select(session.ownerId, project.id, f.application.store.project(session.ownerId, project.id).ideas[0].id);
  f.application.store.enqueue(session.ownerId, project.id, 'expand'); await f.application.worker.runNext();
  const entered = deferred<void>(); const write = fs.createWriteStream;
  t.mock.method(fs, 'createWriteStream', (...args: Parameters<typeof write>) => { const stream = write(...args); entered.resolve(); return stream; });
  const boundary = 'synthetic_lifecycle_boundary'; const ended = deferred<void>();
  const client = request(`${f.base}/projects/${project.id}/clips`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': `multipart/form-data; boundary=${boundary}` } }, response => { response.resume(); ended.resolve(); });
  client.on('error', () => ended.resolve());
  client.write(`--${boundary}\r\nContent-Disposition: form-data; name="clip"; filename="synthetic.mp4"\r\nContent-Type: video/mp4\r\n\r\npartial`);
  await entered.promise; const began = performance.now(); await f.application.lifecycle.drain(25); assert(performance.now() - began >= 15);
  await f.application.close(); client.destroy(); await ended.promise;
  assert.deepEqual(await readdir(join(f.dataDir, 'clips')), []);
});

test('image shutdown aborts ffprobe, waits for descriptor closure and prevents a late private catalog commit', async t => {
  const f = await fixture(t); const session = await loginOwner(f); const project = f.application.store.createProject(session.ownerId, brief);
  const entered = deferred<void>(); const child = new EventEmitter() as ChildProcess; let writes = 0; let aborted = false;
  t.mock.method(ProjectFiles.prototype, 'addImage', () => { writes++; throw new Error('Unexpected image commit'); });
  t.mock.method(childProcess, 'execFile', (...args: unknown[]) => {
    const options = args[2] as { signal: AbortSignal }; const callback = args[3] as (error: Error | null, stdout: string) => void;
    options.signal.addEventListener('abort', () => { aborted = true; callback(new Error('synthetic abort'), ''); }, { once: true });
    entered.resolve(); return child;
  });
  syncBuiltinESMExports(); t.after(() => { child.emit('close'); t.mock.restoreAll(); syncBuiltinESMExports(); });
  const body = new FormData(); body.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'synthetic.png');
  const response = fetch(`${f.base}/projects/${project.id}/images`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf }, body });
  await entered.promise; await f.application.close(); assert.equal(aborted, true);
  // The file is still in use until child close; handler cleanup must not unlink it early.
  assert.equal((await readdir(join(f.dataDir, 'images'))).length, 1);
  child.emit('close'); assert.equal((await response).status, 503);
  assert.equal(writes, 0); assert.deepEqual(await readdir(join(f.dataDir, 'images')), []);
});

test('late diskStorage completion after the entire request body ends removes its owned file after shutdown', async t => {
  for (const kind of ['clips', 'audio', 'images'] as const) await t.test(kind, async sub => {
    const f = await fixture(sub); const session = await loginOwner(f); const project = f.application.store.createProject(session.ownerId, brief);
    f.application.store.enqueue(session.ownerId, project.id, 'ideas'); await f.application.worker.runNext();
    f.application.store.select(session.ownerId, project.id, f.application.store.project(session.ownerId, project.id).ideas[0].id);
    f.application.store.enqueue(session.ownerId, project.id, 'expand'); await f.application.worker.runNext();
    const entered = deferred<void>(); const finished = deferred<void>(); const engine = Object.getPrototypeOf(multer.diskStorage({})) as multer.StorageEngine;
    const handle = engine._handleFile;
    let release!: () => void;
    sub.mock.method(engine, '_handleFile', function(this: multer.StorageEngine, ...args: Parameters<multer.StorageEngine['_handleFile']>) {
      const [req, file, callback] = args;
      handle.call(this, req, file, (error, info) => {
        release = () => callback(error, info);
        if (req.readableEnded) finished.resolve(); else req.once('end', () => finished.resolve());
        entered.resolve();
      });
    });
    const field = kind === 'clips' ? 'clip' : kind === 'audio' ? 'audio' : 'image';
    const extension = kind === 'clips' ? '.mp4' : kind === 'audio' ? '.mp3' : '.png';
    const body = new FormData(); body.set(field, new Blob([new Uint8Array([1, 2, 3])]), `synthetic${extension}`);
    const response = fetch(`${f.base}/projects/${project.id}/${kind}`, { method: 'POST', headers: { Origin: origin, Cookie: session.cookie, 'X-CSRF-Token': session.csrf }, body });
    await entered.promise; await finished.promise;
    assert.equal((await readdir(join(f.dataDir, kind))).length, 1);
    await f.application.close(); assert.equal((await response).status, 503);
    // The raced route had no req.file yet. Only the delayed Multer callback can clean this file.
    assert.equal((await readdir(join(f.dataDir, kind))).length, 1);
    release(); await f.application.lifecycle.drain(1000);
    assert.deepEqual(await readdir(join(f.dataDir, kind)), []);
  });
});

test('late OAuth callback validators fail closed without touching a closed Store', async t => {
  const exchanged = deferred<void>(); const late = deferred<void>(); let validator!: SessionValidator; let validated: boolean | undefined;
  const drive: DriveIntegration = {
    async status() { return { provider: 'google_drive', configured: true, connected: true, state: 'connected' }; },
    async begin() { return { authorizationUrl: 'https://example.invalid' }; },
    async callback(_input, validate) { validator = validate; exchanged.resolve(); await late.promise; validated = await validator(crypto.randomUUID(), 'synthetic-session-hash'); },
    async upload() { throw new Error('Unexpected upload'); }, async download() { throw new Error('Unexpected download'); },
  };
  const f = await fixture(t, drive); let reads = 0;
  t.mock.method(f.application.store, 'session', () => { reads++; return null; });
  const response = fetch(`${f.base}/integrations/drive/callback?state=${'s'.repeat(43)}&code=synthetic`, { redirect: 'manual' });
  await exchanged.promise; await f.application.close(); assert.equal((await response).status, 503);
  late.resolve(); await tick(); assert.equal(validated, false); assert.equal(reads, 0);
});

test('pre-aborted image probing starts no process and returns the interruption code', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(probeImage(resolve('.tmp', 'synthetic.png'), abort.signal), (error: unknown) => error instanceof AppError && error.code === 'INTERRUPTED');
});
