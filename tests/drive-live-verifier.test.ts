import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';

// Dynamic URL import keeps this standalone operator script outside the server build.
let importRequests = 0;
const { verifyDriveLive, validateOrigin, DriveVerificationError, main } = await (async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { importRequests++; throw new Error('Import must be inert'); };
  try { return await import(new URL('../scripts/verify-drive-live.mjs', import.meta.url).href); }
  finally { globalThis.fetch = originalFetch; }
})();
const origin = 'http://127.0.0.1:3006';
const projectId = '9f9d8284-f656-4c04-88d8-81a709b8e5cc';
const assetId = '6512978d-ed61-4c11-bfb3-2c4113ee996c';
const transferId = '219a6f66-32c5-4d63-8852-a2f24fc1d96c';
const credentials = { username: 'test_operator', password: 'synthetic-password-only' };
const cookie = `acf_session=${'a'.repeat(64)}`;
const csrf = 'b'.repeat(64);
const name = 'ACF-SYNTHETIC-DRIVE-CANARY.png';
const hash = (kind: string, bytes: Uint8Array) => createHash(kind).update(bytes).digest('hex');
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(value), { status, headers });
const errorIs = (code: string) => (error: unknown) => error instanceof DriveVerificationError && error instanceof Error && error.message === code;
interface Control {
  ready?: boolean; failedTransfer?: boolean; pending?: boolean; badChecksum?: boolean; badBytes?: boolean;
  response?: (path: string) => Response | undefined; hang?: string; hangBody?: string;
}
function fixture(control: Control = {}) {
  const calls: Array<{ path: string; method: string; headers: Headers; body?: RequestInit['body'] }> = [];
  const messages: string[] = [];
  let bytes = Buffer.alloc(0); let projectName = ''; let polls = 0; let time = 0;
  const fetchImpl: typeof fetch = async (address, init) => {
    const url = new URL(String(address)); assert.equal(url.origin, origin);
    const path = url.pathname.replace(/^\/api/, '');
    const method = init?.method ?? 'GET'; const headers = new Headers(init?.headers);
    calls.push({ path, method, headers, body: init?.body });
    assert.equal(init?.redirect, 'error'); assert.equal(init?.credentials, 'omit'); assert(init?.signal);
    if (path !== '/auth/login') {
      assert.equal(headers.get('Cookie'), cookie);
      if (method === 'POST') assert.equal(headers.get('X-CSRF-Token'), csrf);
      assert(!String(init?.body).includes(credentials.password));
    } else {
      assert.equal(headers.get('Cookie'), null); assert.equal(headers.get('X-CSRF-Token'), null);
      assert.deepEqual(JSON.parse(String(init?.body)), credentials);
    }
    assert.equal(headers.get('Origin'), origin);
    if (control.hang === path) return new Promise(() => {});
    if (control.hangBody === path) return new Response(new ReadableStream());
    const override = control.response?.(path); if (override) return override;
    if (path === '/auth/login') return json({ csrfToken: csrf }, 200, { 'Set-Cookie': `${cookie}; HttpOnly; SameSite=Strict; Path=/` });
    if (path === '/auth/logout') return json({ ok: true });
    if (path === '/integrations/capabilities') return json({ capabilities: { storage: { provider: 'google_drive', configured: control.ready !== false, connected: control.ready !== false, state: control.ready === false ? 'not_configured' : 'connected' } } });
    if (path === '/projects') {
      const input = JSON.parse(String(init?.body)); projectName = input.name;
      assert.match(projectName, /^ACF SYNTHETIC DRIVE CANARY /); assert.equal(input.genre, 'Synthetic verification');
      return json({ project: { id: projectId, name: projectName } }, 201);
    }
    if (path === `/projects/${projectId}/storage/prepare`) return json({ storage: { projectId, prepared: true } });
    if (path === `/projects/${projectId}/images`) {
      assert(init?.body instanceof FormData); assert.equal(headers.get('Content-Type'), null);
      const file = init.body.get('image'); assert(file instanceof File); assert.equal(file.name, name); assert.equal(file.type, 'image/png');
      bytes = Buffer.from(await file.arrayBuffer());
      return json({ asset: { id: assetId, projectId, originalName: name, width: 1, height: 1 } }, 201);
    }
    if (path === `/projects/${projectId}/storage/uploads`) {
      assert.deepEqual(JSON.parse(String(init?.body)), { kind: 'images', mediaId: assetId });
      return json({ transfer: { id: transferId, mediaId: assetId, kind: 'images' } }, 202);
    }
    if (path === `/projects/${projectId}/storage`) {
      polls++;
      return json({ storage: { projectId, transfers: [{ id: transferId, mediaId: assetId, kind: 'images', status: control.pending ? 'running' : control.failedTransfer ? 'failed' : 'completed',
        progress: 100, bytes: bytes.length, totalBytes: bytes.length, errorCode: null,
        file: { id: 'remote_canary', name, mimeType: 'image/png', size: bytes.length, verified: true, md5Checksum: control.badChecksum ? '0'.repeat(32) : hash('md5', bytes) } }] } });
    }
    if (path === '/integrations/drive/files/remote_canary' || path === `/projects/${projectId}/images/${assetId}/file`) {
      return new Response(control.badBytes ? Buffer.alloc(bytes.length) : bytes);
    }
    throw new Error('Unexpected request containing private detail');
  };
  return { calls, messages, get bytes() { return bytes; }, get polls() { return polls; }, options: { origin, ...credentials, fetchImpl,
    log: (status: string) => messages.push(status), now: () => time, sleep: async (ms: number) => { time += ms; } } };
}

test('import is inert; origin/credential validation rejects unsafe targets before fetch', async () => {
  assert.equal(importRequests, 0);
  let calls = 0; const fetchImpl = async () => { calls++; throw new Error('must not run'); };
  for (const bad of ['https://example.com', 'http://example.com', `${origin}/`, `${origin}/path`, `${origin}?q=x`, 'http://user:secret@127.0.0.1:3006', 'http://2130706433:3006']) {
    await assert.rejects(verifyDriveLive({ origin: bad, ...credentials, fetchImpl }), errorIs('INVALID_CONFIGURATION'));
  }
  for (const bad of [{ username: '' }, { password: '' }, { requestTimeoutMs: 0 }, { pollTimeoutMs: Infinity }]) {
    await assert.rejects(verifyDriveLive({ origin, ...credentials, fetchImpl, ...bad }), errorIs('INVALID_CONFIGURATION'));
  }
  assert.equal(validateOrigin('https://approved.example', 'https://approved.example'), 'https://approved.example');
  assert.throws(() => validateOrigin('https://other.example', 'https://approved.example'), errorIs('INVALID_CONFIGURATION'));
  assert.equal(calls, 0);
});

test('canary uses normal login/CSRF and image APIs only, verifies both byte hashes, preserves files and logs out', async () => {
  const f = fixture(); const result = await verifyDriveLive(f.options);
  assert.deepEqual(result, { verified: true, restoration: 'NOT_TESTED_NO_CACHE_EVICTION_API', projectId, assetId });
  assert.equal(f.calls[0].path, '/auth/login'); assert.equal(f.calls[1].path, '/integrations/capabilities'); assert.equal(f.calls.at(-1)?.path, '/auth/logout');
  assert.equal(f.calls.filter(call => call.path === '/projects').length, 1);
  assert.equal(f.calls.filter(call => call.path.endsWith('/storage/uploads')).length, 1);
  assert(f.calls.every(call => !/ideas|expand|mode|authorize|callback|setup|retry/.test(call.path) && call.method !== 'DELETE'));
  assert.deepEqual(f.messages, ['DRIVE_READY', 'CANARY_CREATED', 'ROUND_TRIP_VERIFIED', 'RESTORE_NOT_TESTED', 'CANARY_AND_LOCAL_MEDIA_PRESERVED', 'SESSION_LOGGED_OUT']);
  assert(!f.messages.join(' ').includes(credentials.password)); assert(!f.messages.join(' ').includes(cookie)); assert(!f.messages.join(' ').includes(csrf));
  // Validate PNG structure, every chunk CRC and decompression instead of trusting a fixture string.
  assert.equal(f.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  for (let offset = 8; offset < f.bytes.length;) {
    const size = f.bytes.readUInt32BE(offset); const kind = f.bytes.toString('ascii', offset + 4, offset + 8);
    assert.equal(crc32(f.bytes.subarray(offset + 4, offset + 8 + size)), f.bytes.readUInt32BE(offset + 8 + size));
    if (kind === 'IHDR') { assert.equal(f.bytes.readUInt32BE(offset + 8), 1); assert.equal(f.bytes.readUInt32BE(offset + 12), 1); }
    if (kind === 'IDAT') assert.equal(inflateSync(f.bytes.subarray(offset + 8, offset + 8 + size)).length, 3);
    offset += size + 12;
  }
});

test('Drive readiness fails before any canary write and closes its own session', async () => {
  const f = fixture({ ready: false });
  await assert.rejects(verifyDriveLive(f.options), errorIs('DRIVE_NOT_READY'));
  assert.deepEqual(f.calls.map(call => call.path), ['/auth/login', '/integrations/capabilities', '/auth/logout']);
});

test('failed transfer/checksum/bytes never report success, retry or delete', async () => {
  for (const [control, code] of [[{ failedTransfer: true }, 'TRANSFER_FAILED'], [{ badChecksum: true }, 'INTEGRITY_MISMATCH'], [{ badBytes: true }, 'INTEGRITY_MISMATCH']] as const) {
    const f = fixture(control);
    await assert.rejects(verifyDriveLive(f.options), errorIs(code));
    assert(!f.messages.includes('ROUND_TRIP_VERIFIED')); assert.equal(f.calls.at(-1)?.path, '/auth/logout');
    assert.equal(f.calls.filter(call => call.path.endsWith('/storage/uploads')).length, 1);
  }
});

test('HTTP/network/redirect/body errors stay sanitized with no replay and logout on post-login failures', async () => {
  for (const response of [() => json({ error: 'secret body password Bearer session' }, 502), () => new Response('private malformed JSON'),
    () => { const value = json({}); Object.defineProperty(value, 'url', { value: 'https://evil.example' }); return value; },
    () => { throw new Error(`private ${credentials.password} ${cookie}`); },
    () => new Response(new Uint8Array(65537))]) {
    const f = fixture({ response: path => path === '/integrations/capabilities' ? response() : undefined });
    await assert.rejects(verifyDriveLive(f.options), (error: unknown) => {
      assert(error instanceof Error); assert(!/secret|password|private|Bearer|session|evil/.test(error.message)); return true;
    });
    assert.equal(f.calls.filter(call => call.path === '/integrations/capabilities').length, 1);
    assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assert(!f.calls.some(call => call.path === '/projects'));
  }
});

test('login rejection does not retry, log credentials or use an existing session', async () => {
  const f = fixture({ response: path => path === '/auth/login' ? json({ detail: credentials.password }, 401) : undefined });
  await assert.rejects(verifyDriveLive(f.options), errorIs('AUTH_FAILED'));
  assert.equal(f.calls.length, 1); assert.deepEqual(f.messages, []);
});

test('fetch and body consumption are deadline bounded even when an injected transport ignores abort', async () => {
  for (const control of [{ hang: '/integrations/capabilities' }, { hangBody: '/integrations/capabilities' }]) {
    const f = fixture(control);
    await assert.rejects(verifyDriveLive({ ...f.options, requestTimeoutMs: 10 }), errorIs('REQUEST_TIMEOUT'));
    assert.equal(f.calls.at(-1)?.path, '/auth/logout'); assert.equal(f.calls.length, 3);
  }
});

test('pending transfer polling has a finite budget and never re-enqueues', async () => {
  const f = fixture({ pending: true });
  await assert.rejects(verifyDriveLive({ ...f.options, pollTimeoutMs: 3, pollIntervalMs: 1 }), errorIs('POLL_TIMEOUT'));
  assert.equal(f.polls, 3); assert.equal(f.calls.at(-1)?.path, '/auth/logout');
  assert.equal(f.calls.filter(call => call.path.endsWith('/storage/uploads')).length, 1);
});

test('a hung sleep and failed logout are bounded and fail closed', async () => {
  const f = fixture({ pending: true });
  await assert.rejects(verifyDriveLive({ ...f.options, pollTimeoutMs: 10, pollIntervalMs: 1, sleep: () => new Promise(() => {}) }), errorIs('POLL_TIMEOUT'));
  const cleanup = fixture({ response: path => path === '/auth/logout' ? json({ detail: 'secret' }, 502) : undefined });
  await assert.rejects(verifyDriveLive(cleanup.options), errorIs('LOGOUT_FAILED'));
  assert.equal(cleanup.calls.filter(call => call.path === '/auth/logout').length, 1); assert(cleanup.messages.includes('LOGOUT_FAILED'));
});

test('CLI credentials come only from private env; unknown/password arguments fail without network or secret output', async () => {
  const f = fixture(); const output: string[] = [];
  const originalFetch = globalThis.fetch; const originalLog = console.log; const originalError = console.error;
  globalThis.fetch = f.options.fetchImpl;
  console.log = console.error = (value: string) => { output.push(value); };
  try {
    assert.equal(await main(['--origin', origin, '--password', credentials.password], {}), 1);
    assert.equal(await main(['--origin', origin], {}), 1);
    assert.equal(f.calls.length, 0);
    assert.equal(await main(['--origin', origin], { ACF_VERIFY_USERNAME: credentials.username, ACF_VERIFY_PASSWORD: credentials.password }), 0);
    assert.equal(f.calls.at(-1)?.path, '/auth/logout');
    for (const secret of [credentials.username, credentials.password, cookie, csrf]) assert(!output.join(' ').includes(secret));
    assert(output.every(line => /^Drive verification: [A-Z_]+\.$/.test(line)));
  } finally { globalThis.fetch = originalFetch; console.log = originalLog; console.error = originalError; }
});
