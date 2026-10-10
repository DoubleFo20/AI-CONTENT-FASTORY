import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Explicit operator command only. Importing this module performs no requests or writes.
// Credentials come from private process environment, never command-line arguments.
const codes = new Set(['INVALID_CONFIGURATION', 'AUTH_FAILED', 'INVALID_RESPONSE', 'DRIVE_NOT_READY',
  'REQUEST_FAILED', 'REQUEST_TIMEOUT', 'TRANSFER_FAILED', 'POLL_TIMEOUT', 'INTEGRITY_MISMATCH', 'LOGOUT_FAILED']);
export class DriveVerificationError extends Error {
  constructor(code) { super(codes.has(code) ? code : 'REQUEST_FAILED'); this.name = 'DriveVerificationError'; }
}
const fail = code => { throw new DriveVerificationError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const digest = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const assetName = 'ACF-SYNTHETIC-DRIVE-CANARY.png';
// Fixed 1x1 PNG; no user media or external asset fetch is involved.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

export function validateOrigin(origin, approvedHttpsOrigin) {
  try {
    const url = new URL(origin);
    if (origin !== url.origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('INVALID_CONFIGURATION');
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'http:' && loopback) && !(url.protocol === 'https:' && approvedHttpsOrigin === origin)) fail('INVALID_CONFIGURATION');
    return origin;
  } catch { fail('INVALID_CONFIGURATION'); }
}

function settings(options) {
  if (!options || typeof options !== 'object') fail('INVALID_CONFIGURATION');
  const origin = validateOrigin(options.origin, options.approvedHttpsOrigin);
  if (typeof options.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(options.username) ||
      typeof options.password !== 'string' || options.password.length < 12 || options.password.length > 128) fail('INVALID_CONFIGURATION');
  const requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  const pollTimeoutMs = options.pollTimeoutMs ?? 180000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  if (![requestTimeoutMs, pollTimeoutMs, pollIntervalMs].every(Number.isSafeInteger) || requestTimeoutMs < 1 || requestTimeoutMs > 60000 ||
      pollTimeoutMs < 1 || pollTimeoutMs > 600000 || pollIntervalMs < 1 || pollIntervalMs > 10000) fail('INVALID_CONFIGURATION');
  return { origin, requestTimeoutMs, pollTimeoutMs, pollIntervalMs };
}

async function boundedBytes(response, limit, signal) {
  if (!response.body) fail('INVALID_RESPONSE');
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > limit) { void response.body.cancel().catch(() => {}); fail('INVALID_RESPONSE'); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) fail('REQUEST_TIMEOUT');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { cancel(); fail('INVALID_RESPONSE'); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

/** One canary per explicit invocation; no automatic retries, cleanup/deletion or AI requests. */
export async function verifyDriveLive(options) {
  const config = settings(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const clock = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let cookie; let csrf; let result; let failure;
  const emit = status => { try { log(status); } catch { /* Status observers never alter the run. */ } };
  const request = async (path, { method = 'GET', body, binary = false, status = 200, timeoutMs = config.requestTimeoutMs } = {}) => {
    const controller = new AbortController(); let timer;
    const url = `${config.origin}/api${path}`;
    const operation = async () => {
      const headers = { Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method === 'POST' ? { 'X-CSRF-Token': csrf } : {}) };
      const multipart = body instanceof globalThis.FormData;
      if (body !== undefined && !multipart) headers['Content-Type'] = 'application/json';
      const response = await fetchImpl(url, { method, headers, body: body === undefined || multipart ? body : JSON.stringify(body),
        redirect: 'error', signal: controller.signal, credentials: 'omit' });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); fail('REQUEST_TIMEOUT'); }
      if (response.redirected || response.url && response.url !== url) { void response.body?.cancel().catch(() => {}); fail('INVALID_RESPONSE'); }
      // Capture only this login's cookie; no cookie jar, existing browser session or database access.
      if (path === '/auth/login' && response.status === 200) {
        const cookies = response.headers.getSetCookie();
        const matches = cookies.map(value => value.split(';', 1)[0]).filter(value => /^acf_session=[a-f0-9]{64}$/.test(value));
        if (matches.length === 1) cookie = matches[0];
      }
      if (response.status !== status) { void response.body?.cancel().catch(() => {}); fail(path === '/auth/login' ? 'AUTH_FAILED' : 'REQUEST_FAILED'); }
      const bytes = await boundedBytes(response, binary ? png.byteLength : 64 * 1024, controller.signal);
      if (binary) return bytes;
      try { return JSON.parse(bytes.toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
    };
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new DriveVerificationError('REQUEST_TIMEOUT')); }, timeoutMs); });
    try { return await Promise.race([operation(), deadline]); }
    catch (error) { throw error instanceof DriveVerificationError ? error : new DriveVerificationError('REQUEST_FAILED'); }
    finally { clearTimeout(timer); }
  };
  try {
    const auth = await request('/auth/login', { method: 'POST', body: { username: options.username, password: options.password } });
    if (typeof auth?.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(auth.csrfToken) || !cookie) fail('INVALID_RESPONSE');
    csrf = auth.csrfToken;
    const capabilities = await request('/integrations/capabilities');
    const drive = capabilities?.capabilities?.storage;
    if (drive?.provider !== 'google_drive' || drive.configured !== true || drive.connected !== true || drive.state !== 'connected') fail('DRIVE_NOT_READY');
    emit('DRIVE_READY');
    const name = `ACF SYNTHETIC DRIVE CANARY ${randomUUID()}`;
    const created = await request('/projects', { method: 'POST', status: 201, body: { name,
      brief: 'Synthetic Drive verification only. No AI generation or real production media.', genre: 'Synthetic verification', audience: 'Operator QA', aspectRatio: '1:1' } });
    const projectId = created?.project?.id;
    if (!uuid(projectId) || created.project.name !== name) fail('INVALID_RESPONSE');
    emit('CANARY_CREATED');
    const prepared = await request(`/projects/${projectId}/storage/prepare`, { method: 'POST', body: {} });
    if (prepared?.storage?.projectId !== projectId || prepared.storage.prepared !== true) fail('INVALID_RESPONSE');
    const form = new globalThis.FormData();
    form.set('image', new globalThis.Blob([png], { type: 'image/png' }), assetName);
    const imported = await request(`/projects/${projectId}/images`, { method: 'POST', body: form, status: 201 });
    const assetId = imported?.asset?.id;
    if (!uuid(assetId) || imported.asset.projectId !== projectId || imported.asset.originalName !== assetName || imported.asset.width !== 1 || imported.asset.height !== 1) fail('INVALID_RESPONSE');
    const queued = await request(`/projects/${projectId}/storage/uploads`, { method: 'POST', status: 202, body: { kind: 'images', mediaId: assetId } });
    const transferId = queued?.transfer?.id;
    if (!uuid(transferId) || queued.transfer.mediaId !== assetId || queued.transfer.kind !== 'images') fail('INVALID_RESPONSE');
    const started = clock(); let transfer;
    for (;;) {
      const remaining = config.pollTimeoutMs - (clock() - started);
      if (remaining <= 0) fail('POLL_TIMEOUT');
      const state = await request(`/projects/${projectId}/storage`, { timeoutMs: Math.min(config.requestTimeoutMs, remaining) });
      if (state?.storage?.projectId !== projectId || !Array.isArray(state.storage.transfers)) fail('INVALID_RESPONSE');
      const matches = state.storage.transfers.filter(item => item.id === transferId);
      if (matches.length !== 1) fail('INVALID_RESPONSE');
      transfer = matches[0];
      if (transfer.mediaId !== assetId || transfer.kind !== 'images' || !['queued', 'running', 'completed', 'failed'].includes(transfer.status)) fail('INVALID_RESPONSE');
      if (transfer.status === 'failed') fail('TRANSFER_FAILED');
      if (transfer.status === 'completed') break;
      const waitMs = Math.min(config.pollIntervalMs, config.pollTimeoutMs - (clock() - started));
      if (waitMs <= 0) fail('POLL_TIMEOUT');
      // A custom injected sleep is bounded too; it cannot hang a test/operator run indefinitely.
      let timer;
      try { await Promise.race([sleep(waitMs), new Promise((_, reject) => { timer = setTimeout(() => reject(new DriveVerificationError('POLL_TIMEOUT')), Math.max(1, config.pollTimeoutMs - (clock() - started))); })]); }
      finally { clearTimeout(timer); }
    }
    const file = transfer.file;
    if (!file || typeof file.id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(file.id) || file.verified !== true ||
        file.name !== assetName || file.mimeType !== 'image/png' || file.size !== png.byteLength || file.md5Checksum !== digest('md5', png) ||
        transfer.progress !== 100 || transfer.bytes !== png.byteLength || transfer.totalBytes !== png.byteLength || transfer.errorCode !== null) fail('INTEGRITY_MISMATCH');
    const remote = await request(`/integrations/drive/files/${file.id}`, { binary: true });
    const local = await request(`/projects/${projectId}/images/${assetId}/file`, { binary: true });
    for (const bytes of [remote, local]) {
      if (bytes.byteLength !== png.byteLength || digest('md5', bytes) !== file.md5Checksum || digest('sha256', bytes) !== digest('sha256', png)) fail('INTEGRITY_MISMATCH');
    }
    // There is no cache eviction API. Reading an existing cache does not prove restoration.
    result = { verified: true, restoration: 'NOT_TESTED_NO_CACHE_EVICTION_API', projectId, assetId };
    emit('ROUND_TRIP_VERIFIED'); emit('RESTORE_NOT_TESTED'); emit('CANARY_AND_LOCAL_MEDIA_PRESERVED');
  } catch (error) { failure = error instanceof DriveVerificationError ? error : new DriveVerificationError('REQUEST_FAILED'); }
  finally {
    if (cookie) {
      try {
        const loggedOut = await request('/auth/logout', { method: 'POST', body: {} });
        if (loggedOut?.ok !== true) fail('LOGOUT_FAILED');
        emit('SESSION_LOGGED_OUT');
      }
      catch { emit('LOGOUT_FAILED'); failure ??= new DriveVerificationError('LOGOUT_FAILED'); }
      cookie = undefined; csrf = undefined;
    }
  }
  if (failure) throw failure;
  return result;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    if (argv.length < 2 || argv[0] !== '--origin' || !(argv.length === 2 || argv.length === 4 && argv[2] === '--approved-https-origin')) fail('INVALID_CONFIGURATION');
    await verifyDriveLive({ origin: argv[1], approvedHttpsOrigin: argv[3], username: env.ACF_VERIFY_USERNAME, password: env.ACF_VERIFY_PASSWORD,
      log: status => console.log(`Drive verification: ${status}.`) });
    return 0;
  } catch (error) {
    console.error(`Drive verification: ${error instanceof DriveVerificationError ? error.message : 'REQUEST_FAILED'}.`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
