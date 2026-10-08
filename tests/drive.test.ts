import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fsPromises, { mkdir, mkdtemp, readFile, readdir, rm, writeFile, truncate, chmod, stat, link } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { createDriveIntegration, createDriveIntegrationFromEnv } from '../server/storage/drive.js';
import { TokenVault } from '../server/storage/vault.js';
import { DRIVE_SCOPE, TOKEN_ENDPOINT, MAX_MULTIPART_BYTES, MAX_MEDIA_BYTES, DriveError, googleRequest, validateUploadSession,
  type DriveOptions, type TokenSet, type DriveErrorCode } from '../server/storage/types.js';

const owner = 'c230af16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const otherOwner = 'd1caaf16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const sessionHash = createHash('sha256').update('mock-session').digest('hex');
const redirectUri = 'http://127.0.0.1:3001/api/integrations/drive/callback';
const marker = (id: string) => createHash('sha256').update(id).digest('hex');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const grant = () => ({ access_token: 'mock-access-token', refresh_token: 'mock-refresh-token', token_type: 'Bearer', expires_in: 3600, scope: DRIVE_SCOPE });
const tokenSet = (now = Date.now()): TokenSet => ({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token', expiresAt: now + 3600_000, scope: DRIVE_SCOPE });
const file = (id = owner, override: Record<string, unknown> = {}) => ({ id: 'managed_file_1', name: 'flow.mp4', mimeType: 'video/mp4', size: '3',
  shared: false, trashed: false, appProperties: { acfOwner: marker(id), acfManaged: '1' }, ...override });
const fails = (code: DriveErrorCode) => (error: unknown) => {
  assert(error instanceof DriveError); assert.equal(error.code, code); assert.equal(error.message, code); return true;
};
async function fixture(t: TestContext, overrides: Partial<DriveOptions> = {}) {
  const base = join(process.cwd(), '.tmp'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'drive-test-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const options: DriveOptions = { privateDir: join(directory, 'vault'), clientId: 'mock-client.apps.googleusercontent.com', clientSecret: 'mock-secret',
    redirectUri, allowedRedirectUris: [redirectUri], encryptionKey: randomBytes(32), fetchImpl: async () => { throw new Error('Unexpected mock call'); }, ...overrides };
  return { directory, options, vault: new TokenVault(options.privateDir, options.encryptionKey!), integration: createDriveIntegration(options) };
}
async function stateFor(integration: ReturnType<typeof createDriveIntegration>, id = owner) {
  const begun = await integration.begin(id, sessionHash);
  return new URL(begun.authorizationUrl).searchParams.get('state')!;
}

test('OAuth uses minimal scope, exact redirect, PKCE and one-time owner/session-bound state without a cookie', async t => {
  let calls = 0; let verifier = ''; let validated = 0;
  const f = await fixture(t, { fetchImpl: async (url, init) => {
    calls++; assert.equal(url, TOKEN_ENDPOINT); assert.equal(init?.redirect, 'manual'); assert(init?.signal);
    const body = new URLSearchParams(String(init?.body)); verifier = body.get('code_verifier')!;
    assert.equal(body.get('redirect_uri'), redirectUri); assert.equal(body.get('grant_type'), 'authorization_code'); assert.equal(body.get('code'), 'mock-code');
    return json(grant());
  } });
  const begun = new URL((await f.integration.begin(owner, sessionHash)).authorizationUrl);
  assert.equal(begun.origin, 'https://accounts.google.com'); assert.equal(begun.pathname, '/o/oauth2/v2/auth');
  assert.equal(begun.searchParams.get('scope'), DRIVE_SCOPE); assert.equal(begun.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(begun.searchParams.get('include_granted_scopes'), 'false'); assert(!begun.href.includes('mock-secret'));
  const state = begun.searchParams.get('state')!;
  await f.integration.callback({ code: 'mock-code', state }, (id, hash) => { validated++; assert.equal(id, owner); assert.equal(hash, sessionHash); return true; });
  assert.equal(validated, 2); assert.equal(createHash('sha256').update(verifier).digest('base64url'), begun.searchParams.get('code_challenge'));
  assert.equal((await f.integration.status(owner)).state, 'connected');
  await assert.rejects(f.integration.callback({ code: 'mock-code', state }, () => true), fails('DRIVE_STATE_INVALID'));
  assert.equal(calls, 1);
});

test('expired state, wrong/live-session invalidation and denied consent fail closed and consume state', async t => {
  let now = 100_000; let calls = 0;
  const f = await fixture(t, { now: () => now, stateTtlMs: 100, fetchImpl: async () => { calls++; return json(grant()); } });
  let state = await stateFor(f.integration); now += 100;
  await assert.rejects(f.integration.callback({ code: 'mock-code', state }, () => true), fails('DRIVE_STATE_INVALID'));
  state = await stateFor(f.integration);
  await assert.rejects(f.integration.callback({ code: 'mock-code', state }, () => false), fails('DRIVE_STATE_INVALID'));
  await assert.rejects(f.integration.callback({ code: 'mock-code', state }, () => true), fails('DRIVE_STATE_INVALID'));
  state = await stateFor(f.integration);
  await assert.rejects(f.integration.callback({ error: 'access_denied:private-details', state }, () => true), fails('DRIVE_AUTH_FAILED'));
  assert.equal(calls, 0); assert.equal(await f.vault.read(owner), null);
  state = await stateFor(f.integration); let validation = 0;
  await assert.rejects(f.integration.callback({ code: 'mock-code', state }, () => ++validation === 1), fails('DRIVE_STATE_INVALID'));
  assert.equal(calls, 1); assert.equal(await f.vault.read(owner), null);
});

test('new begin supersedes old owner state and callback cannot combine a new grant with old account refresh tokens', async t => {
  const f = await fixture(t, { fetchImpl: async () => json({ ...grant(), refresh_token: undefined }) });
  await f.vault.write(owner, tokenSet());
  const old = await stateFor(f.integration); const current = await stateFor(f.integration);
  await assert.rejects(f.integration.callback({ code: 'mock-code', state: old }, () => true), fails('DRIVE_STATE_INVALID'));
  await assert.rejects(f.integration.callback({ code: 'mock-code', state: current }, () => true), fails('DRIVE_AUTH_FAILED'));
  assert.deepEqual(await f.vault.read(owner), tokenSet((await f.vault.read(owner))!.expiresAt - 3600_000));
});

test('vault encrypts at rest, writes atomically, authenticates owner and rejects tampering/wrong key', async t => {
  const f = await fixture(t); const tokens = tokenSet(); await f.vault.write(owner, tokens);
  assert.deepEqual(await f.vault.read(owner), tokens); assert.equal(await f.vault.read(otherOwner), null);
  const filenames = await readdir(f.options.privateDir); assert.equal(filenames.length, 1); assert(filenames[0].endsWith('.json'));
  const filename = join(f.options.privateDir, filenames[0]); const encrypted = await readFile(filename, 'utf8');
  assert(!encrypted.includes(tokens.accessToken)); assert(!encrypted.includes(tokens.refreshToken!)); assert(!encrypted.includes(owner));
  await writeFile(join(f.options.privateDir, `${marker(otherOwner)}.json`), encrypted);
  await assert.rejects(f.vault.read(otherOwner), fails('DRIVE_VAULT_FAILED'));
  await assert.rejects(new TokenVault(f.options.privateDir, randomBytes(32)).read(owner), fails('DRIVE_VAULT_FAILED'));
  const envelope = JSON.parse(encrypted) as { ciphertext: string };
  envelope.ciphertext = (envelope.ciphertext.startsWith('00') ? '01' : '00') + envelope.ciphertext.slice(2);
  await writeFile(filename, JSON.stringify(envelope));
  await assert.rejects(f.vault.read(owner), fails('DRIVE_VAULT_FAILED'));
  assert.equal((await f.integration.status(owner)).state, 'failed');
});

test('POSIX vault repairs broad existing modes before reads/writes and refuses outside hard-link aliases', { skip: process.platform === 'win32' }, async t => {
  const f = await fixture(t); const tokens = tokenSet(); await f.vault.write(owner, tokens);
  const filename = join(f.options.privateDir, `${marker(owner)}.json`);
  await chmod(f.options.privateDir, 0o777); await chmod(filename, 0o666);
  assert.deepEqual(await f.vault.read(owner), tokens);
  assert.equal((await stat(f.options.privateDir)).mode & 0o7777, 0o700);
  assert.equal((await stat(filename)).mode & 0o7777, 0o600);
  await chmod(f.options.privateDir, 0o775); await chmod(filename, 0o664);
  const updated = { ...tokens, accessToken: 'updated-mock-token' }; await f.vault.write(owner, updated);
  assert.equal((await stat(f.options.privateDir)).mode & 0o7777, 0o700);
  assert.equal((await stat(filename)).mode & 0o7777, 0o600);
  assert.deepEqual(await f.vault.read(owner), updated);
  const alias = join(f.directory, 'outside-vault-alias'); await link(filename, alias); await chmod(filename, 0o666);
  await assert.rejects(f.vault.read(owner), fails('DRIVE_VAULT_FAILED'));
  await assert.rejects(f.vault.write(owner, tokens), fails('DRIVE_VAULT_FAILED'));
  assert.equal((await stat(alias)).mode & 0o7777, 0o666); // Fail before chmod could affect an alias outside the owned vault.
});

test('upload closes the source descriptor when initial stat fails and returns a safe error', async t => {
  const f = await fixture(t); const filename = join(f.directory, 'managed.mp4'); await writeFile(filename, new Uint8Array([1, 2, 3]));
  const integration = createDriveIntegration({ ...f.options, allowedFileRoots: [f.directory] });
  const originalOpen = fsPromises.open; let closed = 0;
  t.mock.method(fsPromises, 'open', async (...args: Parameters<typeof originalOpen>) => {
    const handle = await originalOpen(...args);
    if (args[0] === filename) {
      const originalClose = handle.close.bind(handle);
      t.mock.method(handle, 'stat', async () => { throw new Error('private-path-and-provider-details'); });
      t.mock.method(handle, 'close', async () => { closed++; await originalClose(); });
    }
    return handle;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(integration.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', filePath: filename }), fails('DRIVE_INVALID_INPUT'));
    assert.equal(closed, 1);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test('missing env/key/allowlist stays inert; redirects permit only exact loopback HTTP or HTTPS values', async t => {
  const f = await fixture(t); let calls = 0;
  const missing = createDriveIntegrationFromEnv(f.options.privateDir, { env: {}, fetchImpl: async () => { calls++; return json(grant()); } });
  assert.deepEqual(await missing.status(owner), { provider: 'google_drive', configured: false, connected: false, state: 'not_configured' });
  await assert.rejects(missing.begin(owner, sessionHash), fails('DRIVE_NOT_CONFIGURED'));
  await assert.rejects(missing.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1]) }), fails('DRIVE_NOT_CONFIGURED'));
  for (const redirect of ['http://example.com/callback', 'https://user:pass@example.com/callback', `${redirectUri}?returnTo=evil`, `${redirectUri}#token`, 'https://example.com/%2e%2e/callback']) {
    const bad = createDriveIntegration({ ...f.options, redirectUri: redirect, allowedRedirectUris: [redirect] });
    assert.equal((await bad.status(owner)).configured, false);
  }
  assert.equal((await createDriveIntegration({ ...f.options, allowedRedirectUris: [`${redirectUri}/`] }).status(owner)).configured, false);
  assert.equal((await createDriveIntegration({ ...f.options, redirectUri: 'https://app.example/callback', allowedRedirectUris: ['https://app.example/callback'] }).status(owner)).configured, true);
  const env = { GOOGLE_CLIENT_ID: f.options.clientId!, GOOGLE_CLIENT_SECRET: f.options.clientSecret!, GOOGLE_REDIRECT_URI: redirectUri,
    ACF_TOKEN_ENCRYPTION_KEY: Buffer.from(f.options.encryptionKey!).toString('base64'), ACF_DRIVE_ALLOWED_REDIRECT_URIS: redirectUri };
  assert.equal((await createDriveIntegrationFromEnv(f.options.privateDir, { env }).status(owner)).configured, true);
  assert.equal(calls, 0);
});

test('expired access refreshes once for concurrent calls, retains expiry, and denied/expired refresh cannot continue', async t => {
  const now = 500_000; let refreshes = 0; let denied = false;
  const f = await fixture(t, { now: () => now, fetchImpl: async (url, init) => {
    if (url === TOKEN_ENDPOINT) {
      refreshes++; const body = new URLSearchParams(String(init?.body)); assert.equal(body.get('grant_type'), 'refresh_token');
      assert.equal(body.get('refresh_token'), 'mock-refresh-token');
      if (denied) return json({ error: 'invalid_grant', error_description: 'secret-provider-body' }, 400);
      return json({ access_token: 'new-mock-token', token_type: 'Bearer', expires_in: 3600 });
    }
    if (String(url).includes('alt=media')) return new Response(new Uint8Array([1, 2, 3]));
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer new-mock-token'); return json(file());
  } });
  const previous = { ...tokenSet(now), expiresAt: now - 1, refreshExpiresAt: now + 500_000 };
  await f.vault.write(owner, previous);
  await Promise.all([f.integration.download(owner, 'managed_file_1'), f.integration.download(owner, 'managed_file_1')]);
  assert.equal(refreshes, 1); assert.equal((await f.vault.read(owner))!.refreshExpiresAt, previous.refreshExpiresAt);
  await f.vault.write(owner, { ...previous, refreshExpiresAt: now - 1 });
  await assert.rejects(f.integration.download(owner, 'managed_file_1'), fails('DRIVE_AUTH_FAILED')); assert.equal(refreshes, 1);
  await f.vault.write(owner, previous); denied = true;
  await assert.rejects(f.integration.download(owner, 'managed_file_1'), fails('DRIVE_AUTH_FAILED'));
  assert.equal((await f.vault.read(owner))!.reauthorizationRequired, true);
  await assert.rejects(f.integration.download(owner, 'managed_file_1'), fails('DRIVE_AUTH_FAILED')); assert.equal(refreshes, 2);
});

test('multipart uploads use private owner metadata, exact endpoint, MIME/filename validation and managed file download', async t => {
  let uploaded = false;
  const f = await fixture(t, { fetchImpl: async (url, init) => {
    assert.equal(init?.redirect, 'manual'); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-access-token');
    const parsed = new URL(String(url)); assert.equal(parsed.origin, 'https://www.googleapis.com');
    if (init?.method === 'POST') {
      uploaded = true; assert.equal(parsed.pathname, '/upload/drive/v3/files'); assert.equal(parsed.searchParams.get('uploadType'), 'multipart');
      const headers = new Headers(init.headers); assert(headers.get('Content-Type')!.startsWith('multipart/related; boundary=acf_'));
      const body = new Uint8Array(await new Response(init.body).arrayBuffer());
      assert.equal(body.byteLength, Number(headers.get('Content-Length')));
      const text = Buffer.from(body).toString('utf8'); assert(text.includes(`"acfOwner":"${marker(owner)}"`)); assert(text.includes('"acfManaged":"1"'));
      assert(!text.includes('permissions')); assert(!text.includes('anyone')); return json(file());
    }
    if (parsed.searchParams.get('alt') === 'media') return new Response(new Uint8Array([1, 2, 3]));
    return json(file());
  } });
  await f.vault.write(owner, tokenSet());
  const result = await f.integration.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]) });
  assert.equal(uploaded, true); assert.deepEqual(result, { id: 'managed_file_1', name: 'flow.mp4', mimeType: 'video/mp4', size: 3 });
  assert.deepEqual(await f.integration.download(owner, result.id), new Uint8Array([1, 2, 3]));
  for (const name of ['../flow.mp4', 'folder\\flow.mp4', 'bad\r\nname', '']) await assert.rejects(f.integration.upload(owner, { name, mimeType: 'video/mp4', bytes: new Uint8Array([1]) }), fails('DRIVE_INVALID_INPUT'));
  await assert.rejects(f.integration.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4\r\nX:attack', bytes: new Uint8Array([1]) }), fails('DRIVE_INVALID_INPUT'));
  await assert.rejects(f.integration.download(owner, '../not-google'), fails('DRIVE_INVALID_INPUT'));
  await assert.rejects(f.integration.download(otherOwner, result.id), fails('DRIVE_NOT_CONNECTED'));
  await f.vault.write(otherOwner, tokenSet());
  await assert.rejects(f.integration.download(otherOwner, result.id), fails('DRIVE_ACCESS_DENIED'));
});

test('owner-managed file that becomes shared or enters Shared Drive is denied before fetching media', async t => {
  let shared = true; let driveId: string | undefined = undefined; let mediaCalls = 0; let metadataCalls = 0;
  const f = await fixture(t, { fetchImpl: async url => {
    if (new URL(String(url)).searchParams.get('alt') === 'media') { mediaCalls++; return new Response(new Uint8Array([1, 2, 3])); }
    metadataCalls++; return json(file(owner, { shared, ...(driveId ? { driveId } : {}) }));
  } });
  await f.vault.write(owner, tokenSet());
  await assert.rejects(f.integration.download(owner, 'managed_file_1'), fails('DRIVE_ACCESS_DENIED'));
  assert.equal(mediaCalls, 0);
  shared = false; driveId = 'shared_drive_1';
  await assert.rejects(f.integration.download(owner, 'managed_file_1'), fails('DRIVE_ACCESS_DENIED'));
  assert.equal(metadataCalls, 2); assert.equal(mediaCalls, 0);
});

test('private accessible parent is validated; shared/trashed/foreign parents are rejected before upload', async t => {
  let shared = true; let uploads = 0;
  const f = await fixture(t, { fetchImpl: async (url, init) => {
    if (init?.method === 'POST') { uploads++; return json(file()); }
    assert(String(url).includes('/private_folder?')); return json(file(owner, { id: 'private_folder', mimeType: 'application/vnd.google-apps.folder', shared }));
  } });
  await f.vault.write(owner, tokenSet());
  const input = { name: 'flow.mp4', mimeType: 'video/mp4', bytes: new Uint8Array([1, 2, 3]), parentId: 'private_folder' };
  await assert.rejects(f.integration.upload(owner, input), fails('DRIVE_ACCESS_DENIED')); assert.equal(uploads, 0);
  shared = false; await f.integration.upload(owner, input); assert.equal(uploads, 1);
  await assert.rejects(f.integration.upload(owner, { ...input, parentId: 'https://evil.invalid' }), fails('DRIVE_INVALID_INPUT'));
});

test('large file uses bounded 256KiB-aligned resumable chunks and validates exact session URL/acknowledgement', async t => {
  let puts = 0; let total = 0; let attributes: Record<string, unknown> = {};
  const size = MAX_MULTIPART_BYTES + 257; const sessionUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock_session';
  const f = await fixture(t, { fetchImpl: async (url, init) => {
    assert.equal(init?.redirect, 'manual'); assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer mock-access-token');
    if (init?.method === 'POST') {
      assert.equal(new URL(String(url)).searchParams.get('uploadType'), 'resumable');
      attributes = JSON.parse(String(init.body)) as Record<string, unknown>;
      assert.equal(new Headers(init.headers).get('X-Upload-Content-Length'), String(size));
      return new Response(null, { status: 200, headers: { Location: sessionUrl } });
    }
    assert.equal(url, sessionUrl); assert.equal(init?.method, 'PUT'); puts++;
    const bytes = new Uint8Array(await new Response(init.body).arrayBuffer());
    assert(bytes.byteLength <= 4 * 1024 * 1024); assert.equal(new Headers(init.headers).get('Content-Range'), `bytes ${total}-${total + bytes.byteLength - 1}/${size}`);
    total += bytes.byteLength;
    if (total < size) { assert.equal(bytes.byteLength % (256 * 1024), 0); return new Response(null, { status: 308, headers: { Range: `bytes=0-${total - 1}` } }); }
    return json(file(owner, { size: String(size), appProperties: attributes.appProperties }));
  } });
  await f.vault.write(owner, tokenSet());
  const path = join(f.directory, 'managed.mp4'); await writeFile(path, new Uint8Array()); await truncate(path, size);
  const integration = createDriveIntegration({ ...f.options, allowedFileRoots: [f.directory] });
  const result = await integration.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', filePath: path });
  assert.equal(result.size, size); assert.equal(total, size); assert.equal(puts, 2);
  await truncate(path, MAX_MEDIA_BYTES + 1);
  await assert.rejects(integration.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', filePath: path }), fails('DRIVE_FILE_TOO_LARGE'));
  const denied = createDriveIntegration({ ...f.options, allowedFileRoots: [join(f.directory, 'vault')] });
  await assert.rejects(denied.upload(owner, { name: 'flow.mp4', mimeType: 'video/mp4', filePath: path }), fails('DRIVE_INVALID_INPUT'));
});

test('resumable rejects foreign sessions/partial acknowledgement and never repeats ambiguous requests', async t => {
  for (const location of ['http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=id',
    'https://evil.invalid/upload/drive/v3/files?uploadType=resumable&upload_id=id',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=id&redirect=https://evil.invalid']) {
    assert.throws(() => validateUploadSession(location), fails('DRIVE_INVALID_OUTPUT'));
  }
  let puts = 0; let badLocation = true;
  const f = await fixture(t, { fetchImpl: async (_url, init) => {
    if (init?.method === 'POST') return new Response(null, { headers: { Location: badLocation ? 'https://evil.invalid/session' : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock_session' } });
    puts++; return new Response(null, { status: 308, headers: { Range: 'bytes=0-1' } });
  } });
  await f.vault.write(owner, tokenSet());
  const input = { name: 'flow.mp4', mimeType: 'video/mp4', bytes: new Uint8Array(MAX_MULTIPART_BYTES + 1) };
  await assert.rejects(f.integration.upload(owner, input), fails('DRIVE_INVALID_OUTPUT')); assert.equal(puts, 0);
  badLocation = false;
  await assert.rejects(f.integration.upload(owner, input), fails('DRIVE_REQUEST_FAILED')); assert.equal(puts, 1);
  const failure = createDriveIntegration({ ...f.options, fetchImpl: async (_url, init) => {
    if (init?.method === 'POST') return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=mock_session' } });
    puts++; throw new Error('Bearer secret; D:/private/token');
  } });
  await assert.rejects(failure.upload(owner, input), fails('DRIVE_REQUEST_FAILED')); assert.equal(puts, 2);
});

test('network endpoints/redirects/error bodies are restricted and response streams/timeouts are bounded', async t => {
  const f = await fixture(t); const url = 'https://www.googleapis.com/drive/v3/files/managed_file_1?alt=media';
  let calls = 0;
  await assert.rejects(googleRequest(async () => { calls++; return json({}); }, 'http://evil.invalid', {}, 20, 20, 'drive'), fails('DRIVE_INVALID_INPUT')); assert.equal(calls, 0);
  await assert.rejects(googleRequest(async (_url, init) => { assert.equal(init?.redirect, 'manual'); return new Response('secret-body', { status: 302, headers: { Location: 'https://evil.invalid' } }); }, url, {}, 20, 20, 'drive'), fails('DRIVE_REQUEST_FAILED'));
  await assert.rejects(googleRequest(async () => json({ secret: 'oauth-token' }, 403), url, {}, 100, 20, 'drive'), fails('DRIVE_ACCESS_DENIED'));
  await assert.rejects(googleRequest(async () => { throw new Error('D:/private/path Bearer token'); }, url, {}, 100, 20, 'drive'), fails('DRIVE_REQUEST_FAILED'));
  await assert.rejects(googleRequest(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1, 2, 3])); controller.enqueue(new Uint8Array([4, 5, 6])); controller.close(); } })), url, {}, 4, 20, 'drive'), fails('DRIVE_FILE_TOO_LARGE'));
  await assert.rejects(googleRequest(async () => new Promise<Response>(() => {}), url, {}, 100, 10, 'drive'), fails('DRIVE_TIMEOUT'));
  await assert.rejects(googleRequest(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array([1])); } })), url, {}, 100, 10, 'drive'), fails('DRIVE_TIMEOUT'));
  assert.equal((await f.integration.status(randomUUID())).state, 'disconnected');
});
