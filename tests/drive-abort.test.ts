import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createDriveIntegration } from '../server/storage/drive.js';
import { DriveOAuth, oauthConfiguration } from '../server/storage/oauth.js';
import { TokenVault } from '../server/storage/vault.js';
import { DRIVE_ENDPOINT, DRIVE_SCOPE, MAX_MULTIPART_BYTES, TOKEN_ENDPOINT, DriveError, googleResponse, type DriveOptions } from '../server/storage/types.js';

const owner = 'c230af16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const project = { id: 'ad385bdc-e412-45fd-87ac-f31be55e7c8d', name: 'Abort QA' };
const json = (value: unknown) => new Response(JSON.stringify(value));
const interrupted = (error: unknown) => { assert(error instanceof DriveError); assert.equal(error.code, 'DRIVE_REQUEST_FAILED'); return true; };
const file = () => ({ id: 'managed_binary', name: 'clip.mp4', mimeType: 'video/mp4', size: '3', shared: false, trashed: false,
  appProperties: { acfOwner: createHash('sha256').update(owner).digest('hex'), acfManaged: '1' } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve };
}
async function fixture(t: TestContext, fetchImpl: typeof fetch, expired = false) {
  const base = join(process.cwd(), '.tmp'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'drive-abort-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const redirectUri = 'http://127.0.0.1:3001/api/integrations/drive/callback';
  const options: DriveOptions = { privateDir: directory, encryptionKey: randomBytes(32), clientId: 'synthetic-client', clientSecret: 'synthetic-secret',
    redirectUri, allowedRedirectUris: [redirectUri], timeoutMs: 1000, fetchImpl };
  const vault = new TokenVault(directory, options.encryptionKey!);
  await vault.write(owner, { accessToken: 'synthetic-old-access', refreshToken: 'synthetic-refresh', expiresAt: Date.now() + (expired ? -1 : 3600_000), scope: DRIVE_SCOPE });
  return { options, vault, integration: createDriveIntegration(options), oauth: new DriveOAuth(oauthConfiguration(options)!, vault, options) };
}

test('external abort bounds a noncompliant fetch, cancels its signal and rejects pre-aborted requests without fetch', async () => {
  const controller = new AbortController(); const entered = deferred<void>(); let networkSignal: AbortSignal | null | undefined; let calls = 0;
  const fetchImpl: typeof fetch = async (_url, init) => { calls++; networkSignal = init?.signal; entered.resolve(); return new Promise<Response>(() => {}); };
  const request = googleResponse(fetchImpl, `${DRIVE_ENDPOINT}/managed_binary`, { signal: controller.signal }, 1024, 1000, 'drive');
  const rejected = assert.rejects(request, interrupted); await entered.promise; controller.abort(); await rejected;
  assert.equal(networkSignal?.aborted, true);
  await assert.rejects(googleResponse(fetchImpl, `${DRIVE_ENDPOINT}/managed_binary`, { signal: controller.signal }, 1024, 1000, 'drive'), interrupted);
  assert.equal(calls, 1);
});

test('external abort cancels bounded response consumption as well as connection', async () => {
  const controller = new AbortController(); const reading = deferred<void>(); let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ pull() { reading.resolve(); }, cancel() { cancelled = true; } });
  const request = googleResponse(async () => new Response(stream), `${DRIVE_ENDPOINT}/managed_binary`, { signal: controller.signal }, 1024, 1000, 'drive');
  const rejected = assert.rejects(request, interrupted); await reading.promise; controller.abort(); await rejected;
  assert.equal(cancelled, true);
});

test('aborted owner-serialized preparation never creates requests when its queued turn arrives', async t => {
  const entered = deferred<void>(); let calls = 0; let firstSignal: AbortSignal | null | undefined;
  const f = await fixture(t, async (_url, init) => {
    calls++; if (calls === 1) { firstSignal = init?.signal; entered.resolve(); return new Promise<Response>(() => {}); }
    return json(file());
  });
  const firstAbort = new AbortController(); const queuedAbort = new AbortController();
  const first = f.integration.ensureProjectFolders!(owner, project.id, project.name, { signal: firstAbort.signal });
  const firstRejected = assert.rejects(first, interrupted); await entered.promise;
  const queued = f.integration.ensureProjectFolders!(owner, project.id, project.name, { signal: queuedAbort.signal });
  const queuedRejected = assert.rejects(queued, interrupted); queuedAbort.abort(); await queuedRejected;
  assert.equal(calls, 1); assert.equal(firstSignal?.aborted, false);
  firstAbort.abort(); await firstRejected;
  const result = await f.integration.upload(owner, { name: 'clip.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(result.id, 'managed_binary'); assert.equal(calls, 2); assert.equal(firstSignal?.aborted, true);
});

test('abort reaches multipart upload and prevents queued upload or final success progress', async t => {
  const entered = deferred<void>(); let calls = 0; let networkSignal: AbortSignal | null | undefined; const progress: number[] = [];
  const f = await fixture(t, async (_url, init) => { calls++; networkSignal = init?.signal; entered.resolve(); return new Promise<Response>(() => {}); });
  const firstAbort = new AbortController(); const queuedAbort = new AbortController();
  const first = f.integration.upload(owner, { name: 'clip.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]), signal: firstAbort.signal, onProgress: bytes => { progress.push(bytes); } });
  const firstRejected = assert.rejects(first, interrupted); await entered.promise;
  const queued = f.integration.upload(owner, { name: 'clip.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]), signal: queuedAbort.signal });
  const queuedRejected = assert.rejects(queued, interrupted); queuedAbort.abort(); firstAbort.abort();
  await Promise.all([firstRejected, queuedRejected]); await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(calls, 1); assert.equal(networkSignal?.aborted, true); assert.deepEqual(progress, [0]);
});

test('abort stops resumable chunk requests and never proceeds to the next chunk', async t => {
  const entered = deferred<void>(); const controller = new AbortController(); let calls = 0; let networkSignal: AbortSignal | null | undefined;
  const f = await fixture(t, async (_url, init) => {
    calls++;
    if (init?.method === 'POST') return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic_session' } });
    assert.equal(init?.method, 'PUT'); networkSignal = init.signal; entered.resolve(); return new Promise<Response>(() => {});
  });
  const request = f.integration.upload(owner, { name: 'clip.mp4', mimeType: 'video/mp4', bytes: new Uint8Array(MAX_MULTIPART_BYTES + 1), signal: controller.signal });
  const rejected = assert.rejects(request, interrupted); await entered.promise; controller.abort(); await rejected;
  assert.equal(calls, 2); assert.equal(networkSignal?.aborted, true);
});

test('download forwards abort to the media request and aborts metadata without fetching binary', async t => {
  const controller = new AbortController(); const entered = deferred<void>(); let networkSignal: AbortSignal | null | undefined; let calls = 0;
  const f = await fixture(t, async (url, init) => {
    calls++;
    if (new URL(String(url)).searchParams.get('alt') !== 'media') return json(file());
    networkSignal = init?.signal; entered.resolve(); return new Promise<Response>(() => {});
  });
  const request = f.integration.download(owner, 'managed_binary', { signal: controller.signal });
  const rejected = assert.rejects(request, interrupted); await entered.promise; controller.abort(); await rejected;
  assert.equal(networkSignal?.aborted, true); assert.equal(calls, 2);
  await assert.rejects(f.integration.download(owner, 'managed_binary', { signal: controller.signal }), interrupted); assert.equal(calls, 2);
  const metadataAbort = new AbortController(); const metadataEntered = deferred<void>(); let metadataCalls = 0;
  const g = await fixture(t, async (_url, init) => { metadataCalls++; networkSignal = init?.signal; metadataEntered.resolve(); return new Promise<Response>(() => {}); });
  const metadata = g.integration.download(owner, 'managed_binary', { signal: metadataAbort.signal });
  const metadataRejected = assert.rejects(metadata, interrupted); await metadataEntered.promise; metadataAbort.abort(); await metadataRejected;
  assert.equal(metadataCalls, 1); assert.equal(networkSignal?.aborted, true);
});

test('an aborted ambiguous managed upload preserves its receipt and explicit restart retry verifies the same file without duplication', async t => {
  type RemoteFile = { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; parents?: string[]; appProperties?: Record<string, string> };
  const files = new Map<string, RemoteFile>(); const controller = new AbortController(); let generated = 0; let uploads = 0; let calls = 0;
  const f = await fixture(t, async (url, init) => {
    calls++; const parsed = new URL(String(url)); const method = init?.method ?? 'GET';
    if (parsed.pathname.endsWith('/generateIds')) return json({ ids: [`reserved_${++generated}`], space: 'drive', kind: 'drive#generatedIds' });
    if (parsed.pathname === '/drive/v3/files' && method === 'GET') return json({ files: [] });
    if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
      const entry = JSON.parse(String(init?.body)) as RemoteFile; files.set(entry.id, entry); return json({ ...entry, shared: false, trashed: false });
    }
    if (parsed.pathname.startsWith('/drive/v3/files/')) {
      const id = parsed.pathname.split('/').at(-1)!;
      if (id === 'root') return json({ id: 'my_root', name: 'My Drive', mimeType: 'application/vnd.google-apps.folder', shared: false, trashed: false });
      const entry = files.get(id); return entry ? json({ ...entry, shared: false, trashed: false }) : new Response('{}', { status: 404 });
    }
    assert.equal(parsed.pathname, '/upload/drive/v3/files'); assert.equal(parsed.searchParams.get('uploadType'), 'multipart'); uploads++;
    const bytes = Buffer.from(await new Response(init?.body).arrayBuffer());
    const start = bytes.indexOf('\r\n\r\n') + 4; const end = bytes.indexOf('\r\n--', start);
    const attributes = JSON.parse(bytes.subarray(start, end).toString('utf8')) as RemoteFile;
    const binaryStart = bytes.indexOf('\r\n\r\n', end) + 4; const binary = bytes.subarray(binaryStart, bytes.lastIndexOf('\r\n--'));
    files.set(attributes.id, { ...attributes, size: String(binary.length), md5Checksum: createHash('md5').update(binary).digest('hex') });
    controller.abort(); return new Promise<Response>(() => {});
  });
  const input = { name: 'clip.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]), project, idempotencyKey: 'clips:media' };
  await assert.rejects(f.integration.upload(owner, { ...input, signal: controller.signal }), interrupted);
  assert.equal(uploads, 1); assert.equal(generated, 9);
  const before = calls; const restart = createDriveIntegration(f.options); assert.equal(calls, before);
  const result = await restart.upload(owner, input);
  assert.equal(result.id, 'reserved_9'); assert.equal(result.verified, true); assert.equal(result.md5Checksum, createHash('md5').update(input.bytes).digest('hex'));
  assert.equal(uploads, 1); assert.equal(generated, 9); assert.equal(files.size, 9);
});

test('cancelling one shared OAuth refresh subscriber leaves the other subscriber and request alive', async t => {
  const entered = deferred<void>(); const remote = deferred<Response>(); let calls = 0; let networkSignal: AbortSignal | null | undefined;
  const f = await fixture(t, async (url, init) => { assert.equal(url, TOKEN_ENDPOINT); calls++; networkSignal = init?.signal; entered.resolve(); return remote.promise; }, true);
  const controller = new AbortController();
  const first = f.oauth.accessToken(owner, { signal: controller.signal }); const rejected = assert.rejects(first, interrupted);
  const second = f.oauth.accessToken(owner); await entered.promise; controller.abort(); await rejected;
  assert.equal(networkSignal?.aborted, false); assert.equal(calls, 1);
  remote.resolve(json({ access_token: 'synthetic-new-access', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE }));
  assert.equal(await second, 'synthetic-new-access'); assert.equal((await f.vault.read(owner))?.accessToken, 'synthetic-new-access');
});

test('cancelling the last refresh subscriber aborts HTTP, fences a late response and retains credentials for explicit retry', async t => {
  const entered = deferred<void>(); const remote = deferred<Response>(); let networkSignal: AbortSignal | null | undefined; let calls = 0;
  const f = await fixture(t, async (_url, init) => { calls++; networkSignal = init?.signal; entered.resolve(); return remote.promise; }, true);
  const controller = new AbortController();
  const request = f.oauth.accessToken(owner, { signal: controller.signal }); const rejected = assert.rejects(request, interrupted);
  await entered.promise; controller.abort(); await rejected;
  assert.equal(networkSignal?.aborted, true);
  remote.resolve(json({ access_token: 'synthetic-late-access', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE }));
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal((await f.vault.read(owner))?.accessToken, 'synthetic-old-access'); assert.equal(calls, 1);
});
