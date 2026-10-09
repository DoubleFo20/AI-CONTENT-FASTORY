import test from 'node:test';
import assert from 'node:assert/strict';

// Load through a computed URL so the NodeNext test typecheck does not pull browser-only
// DOM types from src/api.ts into the server/test compilation.
const { download, jsonBody, knownError, request, RequestError } = await import(new URL('../src/api.ts', import.meta.url).href);

test('client requests keep credentials same-origin, disable caching, and carry CSRF without losing caller headers', async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = '';
  let observedInit: RequestInit | undefined;
  globalThis.fetch = async (input, init) => {
    observedUrl = String(input);
    observedInit = init;
    return Response.json({ ok: true });
  };
  try {
    const result = await request('/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'qa-1' }, body: '{}',
    }, 'csrf-test-token');
    assert.deepEqual(result, { ok: true });
    assert.equal(observedUrl, '/api/projects');
    assert.equal(observedInit?.credentials, 'same-origin');
    assert.equal(observedInit?.cache, 'no-store');
    const headers = new Headers(observedInit?.headers);
    assert.equal(headers.get('X-CSRF-Token'), 'csrf-test-token');
    assert.equal(headers.get('X-Request-Id'), 'qa-1');
    assert.equal(headers.get('Content-Type'), 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client errors map only known codes and redact unknown server response details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'PROVIDER_SECRET_RESPONSE' }, detail: 'private detail' }), { status: 502 });
  try {
    await assert.rejects(request('/projects'), (error: unknown) => {
      if (!(error instanceof RequestError)) return false;
      const requestError = error as { code: string; message: string };
      assert.equal(requestError.code, 'INTERNAL_ERROR');
      assert.equal(requestError.message, 'INTERNAL_ERROR');
      assert.equal(requestError.message.includes('private detail'), false);
      return true;
    });
    assert.equal(knownError('AUTH_REQUIRED'), 'AUTH_REQUIRED');
    assert.equal(knownError({ code: 'AUTH_REQUIRED' }), undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('client preserves aborts while normalizing other network failures', async () => {
  const originalFetch = globalThis.fetch;
  const failure = new TypeError('socket details must not be surfaced');
  globalThis.fetch = async () => { throw failure; };
  const controller = new AbortController();
  try {
    await assert.rejects(request('/projects'), (error: unknown) => {
      if (!(error instanceof RequestError)) return false;
      const requestError = error as { code: string; message: string };
      assert.equal(requestError.code, 'NETWORK_ERROR');
      assert.equal(requestError.message, 'NETWORK_ERROR');
      return true;
    });
    controller.abort();
    await assert.rejects(request('/projects', { signal: controller.signal }), (error: unknown) => error === failure);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('download removes its temporary link and revokes the object URL after use', async () => {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const appended: Array<{ href: string; download: string; clickCount: number; removed: boolean; click: () => void; remove: () => void }> = [];
  const revoked: string[] = [];
  URL.createObjectURL = () => 'blob:qa-download';
  URL.revokeObjectURL = (url) => { revoked.push(url); };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      body: {
        append(anchor: (typeof appended)[number]) { appended.push(anchor); },
      },
      createElement() {
        return {
          href: '', download: '', clickCount: 0, removed: false,
          click() { this.clickCount += 1; },
          remove() { this.removed = true; },
        };
      },
    },
  });
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  try {
    await download('/exports/export-1/file', 'story.mp4');
    assert.equal(appended.length, 1);
    assert.equal(appended[0].href, 'blob:qa-download');
    assert.equal(appended[0].download, 'story.mp4');
    assert.equal(appended[0].clickCount, 1);
    assert.equal(appended[0].removed, true);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.deepEqual(revoked, ['blob:qa-download']);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('download does not create a temporary link when aborted while the response body is loading', async () => {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const appended: unknown[] = [];
  let createCount = 0;
  let finishBlob: ((blob: Blob) => void) | undefined;
  URL.createObjectURL = () => { createCount += 1; return 'blob:should-not-exist'; };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body: { append(anchor: unknown) { appended.push(anchor); } }, createElement: () => ({}) },
  });
  globalThis.fetch = async () => ({
    ok: true,
    blob: () => new Promise<Blob>((resolve) => { finishBlob = resolve; }),
  } as Response);
  const controller = new AbortController();
  try {
    const downloading = download('/exports/export-1/file', 'story.mp4', controller.signal);
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    assert.ok(finishBlob);
    finishBlob(new Blob([new Uint8Array([1, 2, 3])]));
    await downloading;
    assert.equal(createCount, 0);
    assert.equal(appended.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});

test('jsonBody serializes the request body as JSON', () => {
  const body = jsonBody({ ideaId: 'idea_7' });
  assert.equal(body.method, 'POST');
  assert.equal(new Headers(body.headers).get('Content-Type'), 'application/json');
  assert.equal(body.body, '{"ideaId":"idea_7"}');
});
