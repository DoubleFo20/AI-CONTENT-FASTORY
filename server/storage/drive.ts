import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { DriveStatus } from '../../shared/integrations.js';
import { DriveOAuth, oauthConfiguration } from './oauth.js';
import { TokenVault } from './vault.js';
import { DRIVE_ENDPOINT, UPLOAD_ENDPOINT, MAX_MULTIPART_BYTES, MAX_MEDIA_BYTES, DriveError, googleRequest, googleResponse, validateUploadSession, validateOwner, validateFileId,
  type DriveOptions, type DriveIntegration, type DriveMedia, type DriveUpload } from './types.js';

const MetadataSchema = z.object({
  id: z.string().min(1).max(256), name: z.string().min(1).max(255), mimeType: z.string().min(1).max(128),
  size: z.string().regex(/^\d+$/).optional(), createdTime: z.string().datetime().optional(),
  shared: z.boolean(), trashed: z.boolean(), driveId: z.string().optional(),
  appProperties: z.record(z.string(), z.string()).optional(),
});
const fields = 'id,name,mimeType,size,createdTime,shared,trashed,driveId,appProperties';
const ownerMarker = (ownerId: string) => createHash('sha256').update(validateOwner(ownerId)).digest('hex');
const parseMetadata = (bytes: Uint8Array) => {
  try { const result = MetadataSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))); validateFileId(result.id); return result; }
  catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
};

interface UploadSource { size: number; read(offset: number, length: number): Promise<Uint8Array>; close(): Promise<void> }
async function uploadSource(input: DriveUpload, allowedFileRoots: string[]): Promise<UploadSource> {
  if ('bytes' in input && input.bytes instanceof Uint8Array && input.filePath === undefined) {
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_MEDIA_BYTES) throw new DriveError('DRIVE_FILE_TOO_LARGE');
    const bytes = input.bytes;
    return { size: bytes.byteLength, async read(offset, length) { return bytes.slice(offset, offset + length); }, async close() {} };
  }
  if (!input.filePath || input.bytes !== undefined || !isAbsolute(input.filePath) || allowedFileRoots.length === 0) throw new DriveError('DRIVE_INVALID_INPUT');
  try {
    const info = await lstat(input.filePath);
    if (!info.isFile() || info.isSymbolicLink()) throw new DriveError('DRIVE_INVALID_INPUT');
    const filename = await realpath(input.filePath); const roots = await Promise.all(allowedFileRoots.map(root => realpath(resolve(root))));
    if (!roots.some(root => { const child = relative(root, filename); return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child); })) throw new DriveError('DRIVE_INVALID_INPUT');
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let size: number;
    try { size = (await handle.stat()).size; }
    catch { await handle.close().catch(() => undefined); throw new DriveError('DRIVE_INVALID_INPUT'); }
    if (size < 1 || size > MAX_MEDIA_BYTES) { await handle.close(); throw new DriveError('DRIVE_FILE_TOO_LARGE'); }
    return { size,
      async read(offset, length) {
        try {
          if ((await handle.stat()).size !== size) throw new DriveError('DRIVE_INVALID_INPUT');
          const bytes = Buffer.alloc(length); let consumed = 0;
          while (consumed < length) {
            const part = await handle.read(bytes, consumed, length - consumed, offset + consumed);
            if (part.bytesRead === 0) throw new DriveError('DRIVE_INVALID_INPUT');
            consumed += part.bytesRead;
          }
          return bytes;
        } catch { throw new DriveError('DRIVE_INVALID_INPUT'); }
      },
      async close() { try { await handle.close(); } catch { throw new DriveError('DRIVE_INVALID_INPUT'); } },
    };
  } catch (error) {
    if (error instanceof DriveError) throw error;
    throw new DriveError('DRIVE_INVALID_INPUT');
  }
}

async function resumableUpload(fetchImpl: typeof fetch, token: string, metadata: object, mimeType: string,
  source: UploadSource, timeoutMs: number): Promise<z.infer<typeof MetadataSchema>> {
  const initiation = new URL(UPLOAD_ENDPOINT); initiation.searchParams.set('uploadType', 'resumable'); initiation.searchParams.set('fields', fields);
  const body = JSON.stringify(metadata);
  const started = await googleResponse(fetchImpl, initiation.toString(), { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
    'Content-Length': String(Buffer.byteLength(body)), 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(source.size),
  }, body }, 32 * 1024, timeoutMs, 'drive');
  const sessionUrl = validateUploadSession(started.headers.get('Location') ?? '');
  // Chunks are 4MiB (16 x 256KiB). A failed/ambiguous request is never automatically repeated.
  const chunkSize = 4 * 1024 * 1024;
  for (let start = 0; start < source.size; start += chunkSize) {
    const end = Math.min(start + chunkSize, source.size); const chunk = await source.read(start, end - start);
    const response = await googleResponse(fetchImpl, sessionUrl, { method: 'PUT', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'Content-Length': String(chunk.byteLength),
      'Content-Range': `bytes ${start}-${end - 1}/${source.size}`,
    }, body: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength) }, 32 * 1024, timeoutMs, 'drive', [308]);
    if (end === source.size) {
      if (![200, 201].includes(response.status)) throw new DriveError('DRIVE_REQUEST_FAILED');
      return parseMetadata(response.bytes);
    }
    if (response.status !== 308 || response.headers.has('Location') || response.headers.get('Range') !== `bytes=0-${end - 1}`) throw new DriveError('DRIVE_REQUEST_FAILED');
  }
  throw new DriveError('DRIVE_INVALID_OUTPUT');
}

function multipart(metadata: object, mimeType: string, bytes: Uint8Array) {
  const boundary = `acf_${randomUUID()}`;
  const header = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  let phase = 0; let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (phase === 0) { phase = 1; controller.enqueue(header); }
      else if (offset < bytes.byteLength) { const end = Math.min(offset + 64 * 1024, bytes.byteLength); controller.enqueue(bytes.subarray(offset, end)); offset = end; }
      else if (phase === 1) { phase = 2; controller.enqueue(tail); }
      else controller.close();
    },
  });
  return { body, contentType: `multipart/related; boundary=${boundary}`, length: header.byteLength + bytes.byteLength + tail.byteLength };
}

export function createDriveIntegration(options: DriveOptions): DriveIntegration {
  const config = oauthConfiguration(options);
  const configured = Boolean(config && options.encryptionKey?.byteLength === 32);
  const vault = configured ? new TokenVault(options.privateDir, options.encryptionKey!) : null;
  const oauth = config && vault ? new DriveOAuth(config, vault, options) : null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxDownload = options.maxDownloadBytes ?? 128 * 1024 * 1024;
  if (!Number.isInteger(maxDownload) || maxDownload < 1 || maxDownload > 128 * 1024 * 1024) throw new DriveError('DRIVE_INVALID_INPUT');
  const requireConfigured = () => { if (!oauth) throw new DriveError('DRIVE_NOT_CONFIGURED'); return oauth; };
  const metadata = async (token: string, fileId: string) => {
    const url = new URL(`${DRIVE_ENDPOINT}/${validateFileId(fileId)}`); url.searchParams.set('fields', fields);
    return parseMetadata(await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` } }, 32 * 1024, timeoutMs, 'drive'));
  };
  return {
    async status(ownerId): Promise<DriveStatus> {
      validateOwner(ownerId);
      if (!oauth) return { provider: 'google_drive', configured: false, connected: false, state: 'not_configured' };
      try {
        const connected = await oauth.connected(ownerId);
        return { provider: 'google_drive', configured: true, connected, state: connected ? 'connected' : 'disconnected' };
      } catch { return { provider: 'google_drive', configured: true, connected: false, state: 'failed' }; }
    },
    async begin(ownerId, sessionHash) { return requireConfigured().begin(ownerId, sessionHash); },
    async callback(input, validateSessionHash) { await requireConfigured().callback(input, validateSessionHash); },
    async upload(ownerId, input): Promise<DriveMedia> {
      const session = requireConfigured(); validateOwner(ownerId);
      if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 255 || ['.', '..'].includes(input.name.trim()) || /[\\/]/.test(input.name) ||
          [...input.name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
          typeof input.mimeType !== 'string' || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/.test(input.mimeType) || input.mimeType.startsWith('application/vnd.google-apps.')) throw new DriveError('DRIVE_INVALID_INPUT');
      const parentId = input.parentId ?? options.defaultParentId;
      if (parentId) validateFileId(parentId);
      const source = await uploadSource(input, options.allowedFileRoots ?? []);
      try {
        const token = await session.accessToken(ownerId);
        if (parentId) {
          const parent = await metadata(token, parentId);
          if (parent.id !== parentId || parent.mimeType !== 'application/vnd.google-apps.folder' || parent.trashed || parent.shared || parent.driveId) throw new DriveError('DRIVE_ACCESS_DENIED');
        }
        const owner = ownerMarker(ownerId);
        const attributes = { name: input.name, mimeType: input.mimeType, appProperties: { acfOwner: owner, acfManaged: '1' }, ...(parentId ? { parents: [parentId] } : {}) };
        let result: z.infer<typeof MetadataSchema>;
        if (source.size > MAX_MULTIPART_BYTES) result = await resumableUpload(fetchImpl, token, attributes, input.mimeType, source, timeoutMs);
        else {
          const bytes = await source.read(0, source.size); const payload = multipart(attributes, input.mimeType, bytes);
          const url = new URL(UPLOAD_ENDPOINT); url.searchParams.set('uploadType', 'multipart'); url.searchParams.set('fields', fields);
          const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': payload.contentType, 'Content-Length': String(payload.length) }, body: payload.body, duplex: 'half' };
          result = parseMetadata(await googleRequest(fetchImpl, url.toString(), init, 32 * 1024, timeoutMs, 'drive'));
        }
        const size = Number(result.size);
        if (result.trashed || result.shared || result.driveId || result.appProperties?.acfOwner !== owner || result.appProperties?.acfManaged !== '1' ||
            result.name !== input.name || result.mimeType !== input.mimeType || !Number.isSafeInteger(size) || size !== source.size) throw new DriveError('DRIVE_INVALID_OUTPUT');
        return { id: result.id, name: result.name, mimeType: result.mimeType, size, ...(result.createdTime ? { createdTime: result.createdTime } : {}) };
      } finally { await source.close(); }
    },
    async download(ownerId, fileId): Promise<Uint8Array> {
      const session = requireConfigured(); validateOwner(ownerId); validateFileId(fileId);
      const token = await session.accessToken(ownerId); const file = await metadata(token, fileId);
      if (file.id !== fileId || file.trashed || file.shared || file.driveId || file.appProperties?.acfOwner !== ownerMarker(ownerId) || file.appProperties?.acfManaged !== '1' || file.mimeType.startsWith('application/vnd.google-apps.')) throw new DriveError('DRIVE_ACCESS_DENIED');
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < 1 || size > maxDownload) throw new DriveError('DRIVE_FILE_TOO_LARGE');
      const url = new URL(`${DRIVE_ENDPOINT}/${fileId}`); url.searchParams.set('alt', 'media');
      const result = await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` } }, maxDownload, timeoutMs, 'drive');
      if (result.byteLength !== size) throw new DriveError('DRIVE_INVALID_OUTPUT');
      return result;
    },
  };
}

export function createDriveIntegrationFromEnv(privateDir: string, options: Omit<DriveOptions, 'privateDir' | 'clientId' | 'clientSecret' | 'redirectUri' | 'encryptionKey' | 'defaultParentId' | 'allowedRedirectUris'> & { env?: NodeJS.ProcessEnv } = {}): DriveIntegration {
  const { env = process.env, ...runtime } = options;
  const encoded = env.ACF_TOKEN_ENCRYPTION_KEY ?? '';
  const decoded = Buffer.from(encoded, 'base64');
  const encryptionKey = decoded.byteLength === 32 && decoded.toString('base64') === encoded ? decoded : undefined;
  return createDriveIntegration({ ...runtime, privateDir, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI, encryptionKey, defaultParentId: env.GOOGLE_DRIVE_FOLDER_ID || undefined,
    allowedRedirectUris: env.ACF_DRIVE_ALLOWED_REDIRECT_URIS?.split(',').map(value => value.trim()).filter(Boolean) });
}
