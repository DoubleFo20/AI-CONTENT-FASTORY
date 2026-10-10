import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { DriveStatus } from '../../shared/integrations.js';
import { DriveOAuth, oauthConfiguration } from './oauth.js';
import { TokenVault } from './vault.js';
import { DRIVE_ENDPOINT, UPLOAD_ENDPOINT, MAX_MULTIPART_BYTES, MAX_MEDIA_BYTES, DriveError, googleRequest, googleResponse, checkDriveSignal, validateUploadSession, validateOwner, validateFileId,
  type DriveOptions, type DriveIntegration, type DriveMedia, type DriveUpload, type DriveProjectFolders } from './types.js';

const MetadataSchema = z.object({
  id: z.string().min(1).max(256), name: z.string().min(1).max(255), mimeType: z.string().min(1).max(128),
  size: z.string().regex(/^\d+$/).optional(), createdTime: z.string().datetime().optional(),
  shared: z.boolean(), trashed: z.boolean(), driveId: z.string().optional(),
  appProperties: z.record(z.string(), z.string()).optional(),
  parents: z.array(z.string().min(1).max(256)).max(1).optional(), md5Checksum: z.string().regex(/^[a-f0-9]{32}$/).optional(),
});
const fields = 'id,name,mimeType,size,createdTime,shared,trashed,driveId,appProperties,parents,md5Checksum';
const folderMime = 'application/vnd.google-apps.folder';
const categories = { story: 'AI Story', productReview: 'Product Review', kidsToy: 'Kids & Toy', investment: 'Investment', sharedAssets: 'Shared Assets', archives: 'Archives' } as const;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ownerMarker = (ownerId: string) => createHash('sha256').update(validateOwner(ownerId)).digest('hex');
const parseMetadata = (bytes: Uint8Array) => {
  try { const result = MetadataSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))); validateFileId(result.id); return result; }
  catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
};

const ReceiptSchema = z.strictObject({ version: z.literal(1), owner: z.string().regex(/^[a-f0-9]{64}$/), key: z.string().regex(/^[a-f0-9]{64}$/),
  fileId: z.string().min(1).max(256), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(), md5Checksum: z.string().regex(/^[a-f0-9]{32}$/).optional() });
type Receipt = z.infer<typeof ReceiptSchema>;
const ReceiptEnvelope = z.strictObject({ iv: z.string().regex(/^[a-f0-9]{24}$/), tag: z.string().regex(/^[a-f0-9]{32}$/), ciphertext: z.string().regex(/^(?:[a-f0-9]{2})+$/).max(16384) });

// Immutable intent is synced before any remote creation. A partial/corrupt receipt fails closed.
// Reusing Google's pre-generated ID is safe even when a previous response was lost (409).
class DriveReceipts {
  private directory: string;
  private encryptionKey: Buffer;
  constructor(privateDir: string, encryptionKey: Uint8Array) { this.directory = resolve(privateDir, 'receipts'); this.encryptionKey = Buffer.from(encryptionKey); }
  private async restrict(handle: FileHandle, directory = false) {
    const info = await handle.stat();
    if (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1 || info.size > 16384) throw new DriveError('DRIVE_VAULT_FAILED');
    if (process.platform !== 'win32') {
      if (!process.getuid || info.uid !== process.getuid()) throw new DriveError('DRIVE_VAULT_FAILED');
      await handle.chmod(directory ? 0o700 : 0o600);
    }
  }
  private async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new DriveError('DRIVE_VAULT_FAILED');
    if (process.platform !== 'win32') {
      const handle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await this.restrict(handle, true); } finally { await handle.close(); }
    }
  }
  async read(owner: string, key: string): Promise<Receipt | null> {
    try {
      await this.prepare();
      const filename = join(this.directory, `${hash(`${owner}:${key}`)}.json`);
      const info = await lstat(filename);
      if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || info.size > 16384) throw new DriveError('DRIVE_VAULT_FAILED');
      const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let stored: string;
      try { await this.restrict(handle); stored = await handle.readFile('utf8'); } finally { await handle.close(); }
      const envelope = ReceiptEnvelope.parse(JSON.parse(stored));
      const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, Buffer.from(envelope.iv, 'hex'));
      decipher.setAAD(Buffer.from(`acf-drive-receipt-v1:${owner}:${key}`)); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]);
      try {
        const receipt = ReceiptSchema.parse(JSON.parse(plaintext.toString('utf8')));
        if (receipt.owner !== owner || receipt.key !== key) throw new Error();
        validateFileId(receipt.fileId); return receipt;
      } finally { plaintext.fill(0); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new DriveError('DRIVE_VAULT_FAILED');
    }
  }
  async reserve(receipt: Receipt): Promise<Receipt> {
    try {
      await this.prepare();
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      cipher.setAAD(Buffer.from(`acf-drive-receipt-v1:${receipt.owner}:${receipt.key}`));
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(receipt), 'utf8'), cipher.final()]);
      const envelope = JSON.stringify({ iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') });
      const handle = await open(join(this.directory, `${hash(`${receipt.owner}:${receipt.key}`)}.json`), 'wx', 0o600);
      try { await this.restrict(handle); await handle.writeFile(envelope); await handle.sync(); } finally { await handle.close(); }
      if (process.platform !== 'win32') {
        const directory = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try { await directory.sync(); } finally { await directory.close(); }
      }
      return receipt;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        const existing = await this.read(receipt.owner, receipt.key);
        if (existing?.fingerprint === receipt.fingerprint) return existing;
        throw new DriveError('DRIVE_INVALID_INPUT');
      }
      throw new DriveError('DRIVE_VAULT_FAILED');
    }
  }
}

async function sourceDigests(source: UploadSource, signal?: AbortSignal) {
  const sha = createHash('sha256'); const md5 = createHash('md5');
  for (let offset = 0; offset < source.size; offset += 4 * 1024 * 1024) {
    checkDriveSignal(signal);
    const bytes = await source.read(offset, Math.min(4 * 1024 * 1024, source.size - offset)); sha.update(bytes); md5.update(bytes);
  }
  checkDriveSignal(signal);
  return { sourceSha256: sha.digest('hex'), md5Checksum: md5.digest('hex') };
}
function progress(callback: DriveUpload['onProgress'], bytes: number, total: number) {
  try { void Promise.resolve(callback?.(bytes, total)).catch(() => undefined); }
  catch { /* Observers cannot change upload correctness or trigger retry. */ }
}

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
  source: UploadSource, timeoutMs: number, onProgress?: DriveUpload['onProgress'], acceptConflict = false, signal?: AbortSignal): Promise<z.infer<typeof MetadataSchema> | null> {
  const initiation = new URL(UPLOAD_ENDPOINT); initiation.searchParams.set('uploadType', 'resumable'); initiation.searchParams.set('fields', fields);
  const body = JSON.stringify(metadata);
  const started = await googleResponse(fetchImpl, initiation.toString(), { method: 'POST', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8',
    'Content-Length': String(Buffer.byteLength(body)), 'X-Upload-Content-Type': mimeType, 'X-Upload-Content-Length': String(source.size),
  }, body, signal }, 32 * 1024, timeoutMs, 'drive', acceptConflict ? [409] : []);
  if (started.status === 409) return null;
  const sessionUrl = validateUploadSession(started.headers.get('Location') ?? '');
  // Chunks are 4MiB (16 x 256KiB). A failed/ambiguous request is never automatically repeated.
  const chunkSize = 4 * 1024 * 1024;
  for (let start = 0; start < source.size; start += chunkSize) {
    checkDriveSignal(signal);
    const end = Math.min(start + chunkSize, source.size); const chunk = await source.read(start, end - start);
    const response = await googleResponse(fetchImpl, sessionUrl, { method: 'PUT', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': mimeType, 'Content-Length': String(chunk.byteLength),
      'Content-Range': `bytes ${start}-${end - 1}/${source.size}`,
    }, body: Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength), signal }, 32 * 1024, timeoutMs, 'drive', acceptConflict ? [308, 409] : [308]);
    if (response.status === 409) return null;
    if (end === source.size) {
      if (![200, 201].includes(response.status)) throw new DriveError('DRIVE_REQUEST_FAILED');
      return parseMetadata(response.bytes);
    }
    if (response.status !== 308 || response.headers.has('Location') || response.headers.get('Range') !== `bytes=0-${end - 1}`) throw new DriveError('DRIVE_REQUEST_FAILED');
    progress(onProgress, end, source.size);
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
  const receipts = configured ? new DriveReceipts(options.privateDir, options.encryptionKey!) : null;
  const oauth = config && vault ? new DriveOAuth(config, vault, options) : null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxDownload = options.maxDownloadBytes ?? 128 * 1024 * 1024;
  if (!Number.isInteger(maxDownload) || maxDownload < 1 || maxDownload > 128 * 1024 * 1024) throw new DriveError('DRIVE_INVALID_INPUT');
  const requireConfigured = () => { if (!oauth) throw new DriveError('DRIVE_NOT_CONFIGURED'); return oauth; };
  const metadata = async (token: string, fileId: string, signal?: AbortSignal) => {
    const url = new URL(`${DRIVE_ENDPOINT}/${validateFileId(fileId)}`); url.searchParams.set('fields', fields);
    return parseMetadata(await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal }, 32 * 1024, timeoutMs, 'drive'));
  };
  const managed = (file: z.infer<typeof MetadataSchema>, owner: string, properties: Record<string, string>, parentId: string) => {
    if (file.shared || file.trashed || file.driveId || file.appProperties?.acfOwner !== owner || file.appProperties?.acfManaged !== '1' ||
        Object.entries(properties).some(([key, value]) => file.appProperties?.[key] !== value) ||
        file.parents?.length !== 1 || file.parents[0] !== parentId) throw new DriveError('DRIVE_ACCESS_DENIED');
  };
  const availableMetadata = async (token: string, fileId: string, signal?: AbortSignal) => {
    try { return await metadata(token, fileId, signal); }
    catch (error) { if (error instanceof DriveError && error.code === 'DRIVE_NOT_FOUND') return null; throw error; }
  };
  const generateId = async (token: string, signal?: AbortSignal) => {
    const url = new URL(`${DRIVE_ENDPOINT}/generateIds`); url.searchParams.set('count', '1'); url.searchParams.set('space', 'drive'); url.searchParams.set('type', 'files');
    const bytes = await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal }, 32 * 1024, timeoutMs, 'drive');
    try {
      const ids = z.object({ ids: z.array(z.string()).length(1), space: z.literal('drive'), kind: z.literal('drive#generatedIds') }).parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
      return validateFileId(ids.ids[0]);
    } catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
  };
  const findFolder = async (token: string, owner: string, key: string, parentId: string, signal?: AbortSignal) => {
    const url = new URL(DRIVE_ENDPOINT);
    url.searchParams.set('q', `trashed = false and mimeType = '${folderMime}' and '${parentId}' in parents and appProperties has { key='acfOwner' and value='${owner}' } and appProperties has { key='acfKey' and value='${key}' }`);
    url.searchParams.set('fields', `files(${fields}),nextPageToken,incompleteSearch`); url.searchParams.set('pageSize', '2'); url.searchParams.set('spaces', 'drive'); url.searchParams.set('corpora', 'user');
    const bytes = await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal }, 64 * 1024, timeoutMs, 'drive');
    try {
      const listing = z.object({ files: z.array(MetadataSchema).max(2), nextPageToken: z.string().optional(), incompleteSearch: z.boolean().optional() }).parse(JSON.parse(Buffer.from(bytes).toString('utf8')));
      if (listing.nextPageToken || listing.incompleteSearch || listing.files.length > 1) throw new Error();
      if (listing.files[0]) validateFileId(listing.files[0].id);
      return listing.files[0] ?? null;
    } catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
  };
  const ensureFolder = async (token: string, owner: string, folderKey: string, name: string, parentId: string, projectMarker?: string, signal?: AbortSignal) => {
    checkDriveSignal(signal);
    const key = hash(folderKey);
    const properties = { acfOwner: owner, acfManaged: '1', acfKey: key, ...(projectMarker ? { acfProject: projectMarker } : {}) };
    const fingerprint = hash(JSON.stringify({ name, parentId, properties }));
    let receipt = await receipts!.read(owner, key);
    if (receipt && receipt.fingerprint !== fingerprint) throw new DriveError('DRIVE_INVALID_INPUT');
    if (!receipt) {
      const existing = await findFolder(token, owner, key, parentId, signal);
      if (existing) {
        managed(existing, owner, properties, parentId);
        if (existing.mimeType !== folderMime || existing.name !== name) throw new DriveError('DRIVE_INVALID_OUTPUT');
      }
      receipt = await receipts!.reserve({ version: 1, owner, key, fingerprint, fileId: existing?.id ?? await generateId(token, signal) });
    }
    let file = await availableMetadata(token, receipt.fileId, signal);
    if (!file) {
      const url = new URL(DRIVE_ENDPOINT); url.searchParams.set('fields', fields);
      const body = JSON.stringify({ id: receipt.fileId, name, mimeType: folderMime, parents: [parentId], appProperties: properties });
      await googleResponse(fetchImpl, url.toString(), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' }, body, signal }, 32 * 1024, timeoutMs, 'drive', [409]);
      file = await metadata(token, receipt.fileId, signal);
    }
    managed(file, owner, properties, parentId);
    if (file.id !== receipt.fileId || file.mimeType !== folderMime || file.name !== name) throw new DriveError('DRIVE_INVALID_OUTPUT');
    return file.id;
  };
  const ensureProjectFolders = async (ownerId: string, projectId: string, projectName: string, signal?: AbortSignal): Promise<DriveProjectFolders> => {
    checkDriveSignal(signal);
    const session = requireConfigured(); validateOwner(ownerId); validateOwner(projectId);
    if (typeof projectName !== 'string' || !projectName.trim() || projectName.length > 120 || /[\\/]/u.test(projectName) ||
        [...projectName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new DriveError('DRIVE_INVALID_INPUT');
    const token = await session.accessToken(ownerId, { signal }); const owner = ownerMarker(ownerId);
    const root = await metadata(token, 'root', signal);
    if (root.mimeType !== folderMime || root.trashed || root.shared || root.driveId) throw new DriveError('DRIVE_ACCESS_DENIED');
    const rootId = await ensureFolder(token, owner, 'folder:root', 'AI-CONTENT-FACTORY', root.id, undefined, signal);
    const folderIds = {} as DriveProjectFolders['categories'];
    for (const key of Object.keys(categories) as Array<keyof typeof categories>) {
      folderIds[key] = await ensureFolder(token, owner, `folder:category:${key}`, categories[key], rootId, undefined, signal);
    }
    const projectFolderId = await ensureFolder(token, owner, `folder:project:${projectId}`, `${projectName.trim()}__${projectId}`, folderIds.story, hash(projectId), signal);
    return { rootId, categories: folderIds, projectFolderId };
  };
  const pending = new Map<string, Promise<unknown>>();
  const serialize = async <T>(ownerId: string, action: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
    validateOwner(ownerId);
    checkDriveSignal(signal);
    const request = (pending.get(ownerId) ?? Promise.resolve()).catch(() => undefined).then(() => { checkDriveSignal(signal); return action(); });
    pending.set(ownerId, request);
    // Keep serialization until the underlying operation settles, even when its caller aborts.
    const cleanup = () => { if (pending.get(ownerId) === request) pending.delete(ownerId); };
    void request.then(cleanup, cleanup);
    let cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new DriveError('DRIVE_REQUEST_FAILED'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
    try { return await Promise.race([request, aborted]); }
    finally { signal?.removeEventListener('abort', cancel); }
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
    async ensureProjectFolders(ownerId, projectId, projectName, options) { return serialize(ownerId, () => ensureProjectFolders(ownerId, projectId, projectName, options?.signal), options?.signal); },
    async upload(ownerId, input): Promise<DriveMedia> {
      return serialize(ownerId, async () => {
        const session = requireConfigured(); validateOwner(ownerId);
        if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 255 || ['.', '..'].includes(input.name.trim()) || /[\\/]/.test(input.name) ||
            [...input.name].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
            typeof input.mimeType !== 'string' || !/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/.test(input.mimeType) || input.mimeType.startsWith('application/vnd.google-apps.')) throw new DriveError('DRIVE_INVALID_INPUT');
        if (input.onProgress !== undefined && typeof input.onProgress !== 'function') throw new DriveError('DRIVE_INVALID_INPUT');
        if (input.project && (input.parentId !== undefined || typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.idempotencyKey))) throw new DriveError('DRIVE_INVALID_INPUT');
        if (!input.project && input.idempotencyKey !== undefined) throw new DriveError('DRIVE_INVALID_INPUT');
        let parentId = input.project ? undefined : input.parentId ?? options.defaultParentId;
        if (parentId) validateFileId(parentId);
        const source = await uploadSource(input, options.allowedFileRoots ?? []);
        try {
          checkDriveSignal(input.signal);
          const token = await session.accessToken(ownerId, { signal: input.signal });
          checkDriveSignal(input.signal);
          const digests = input.project ? await sourceDigests(source, input.signal) : null;
          const projectFolders = input.project ? await ensureProjectFolders(ownerId, input.project.id, input.project.name, input.signal) : null;
          if (projectFolders) parentId = projectFolders.projectFolderId;
          if (parentId) {
            const parent = await metadata(token, parentId, input.signal);
            if (parent.id !== parentId || parent.mimeType !== 'application/vnd.google-apps.folder' || parent.trashed || parent.shared || parent.driveId) throw new DriveError('DRIVE_ACCESS_DENIED');
            if (input.project && projectFolders) managed(parent, ownerMarker(ownerId), { acfKey: hash(`folder:project:${input.project.id}`), acfProject: hash(input.project.id) }, projectFolders.categories.story);
          }
          const owner = ownerMarker(ownerId);
          const key = input.project ? hash(`media:${input.project.id}:${input.idempotencyKey}`) : null;
          const properties = { acfOwner: owner, acfManaged: '1', ...(key && input.project && digests ? { acfKey: key, acfProject: hash(input.project.id), acfSha256: digests.sourceSha256 } : {}) };
          const attributes = { name: input.name, mimeType: input.mimeType, appProperties: properties, ...(parentId ? { parents: [parentId] } : {}) };
          let receipt: Receipt | null = null;
          if (key && digests) {
            const fingerprint = hash(JSON.stringify({ attributes, size: source.size, ...digests }));
            receipt = await receipts!.read(owner, key);
            if (receipt && receipt.fingerprint !== fingerprint) throw new DriveError('DRIVE_INVALID_INPUT');
            receipt ??= await receipts!.reserve({ version: 1, owner, key, fingerprint, fileId: await generateId(token, input.signal), ...digests });
          }
          const validateResult = (result: z.infer<typeof MetadataSchema>) => {
            const size = Number(result.size);
            if (result.trashed || result.shared || result.driveId || result.appProperties?.acfOwner !== owner || result.appProperties?.acfManaged !== '1' ||
                result.name !== input.name || result.mimeType !== input.mimeType || !Number.isSafeInteger(size) || size !== source.size) throw new DriveError('DRIVE_INVALID_OUTPUT');
            if (receipt && digests && parentId) {
              managed(result, owner, properties, parentId);
              if (result.id !== receipt.fileId || result.md5Checksum !== digests.md5Checksum) throw new DriveError('DRIVE_INVALID_OUTPUT');
            }
            return { id: result.id, name: result.name, mimeType: result.mimeType, size, ...(result.createdTime ? { createdTime: result.createdTime } : {}),
              ...(receipt ? { verified: true, md5Checksum: result.md5Checksum } : {}) };
          };
          checkDriveSignal(input.signal); progress(input.onProgress, 0, source.size);
          if (receipt) {
            const existing = await availableMetadata(token, receipt.fileId, input.signal);
            if (existing) { const result = validateResult(existing); progress(input.onProgress, source.size, source.size); return result; }
          }
          const sent = createHash('md5'); const sentSha = createHash('sha256');
          const sendingSource = { ...source, async read(offset: number, length: number) { checkDriveSignal(input.signal); const chunk = await source.read(offset, length); checkDriveSignal(input.signal); sent.update(chunk); sentSha.update(chunk); return chunk; } };
          const uploadAttributes = { ...attributes, ...(receipt ? { id: receipt.fileId } : {}) };
          let result: z.infer<typeof MetadataSchema> | null;
          if (source.size > MAX_MULTIPART_BYTES) result = await resumableUpload(fetchImpl, token, uploadAttributes, input.mimeType, sendingSource, timeoutMs, input.onProgress, Boolean(receipt), input.signal);
          else {
            const bytes = await sendingSource.read(0, source.size); const payload = multipart(uploadAttributes, input.mimeType, bytes);
            const url = new URL(UPLOAD_ENDPOINT); url.searchParams.set('uploadType', 'multipart'); url.searchParams.set('fields', fields);
            const init: RequestInit & { duplex: 'half' } = { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': payload.contentType, 'Content-Length': String(payload.length) }, body: payload.body, duplex: 'half', signal: input.signal };
            const response = await googleResponse(fetchImpl, url.toString(), init, 32 * 1024, timeoutMs, 'drive', receipt ? [409] : []);
            result = response.status === 409 ? null : parseMetadata(response.bytes);
          }
          if (receipt && digests) {
            if (result && (sent.digest('hex') !== digests.md5Checksum || sentSha.digest('hex') !== digests.sourceSha256)) throw new DriveError('DRIVE_INVALID_INPUT');
            result = await metadata(token, receipt.fileId, input.signal);
          }
          if (!result) throw new DriveError('DRIVE_INVALID_OUTPUT');
          const verified = validateResult(result);
          checkDriveSignal(input.signal); progress(input.onProgress, source.size, source.size);
          return verified;
        } finally { await source.close(); }
      }, input.signal);
    },
    async download(ownerId, fileId, downloadOptions): Promise<Uint8Array> {
      const signal = downloadOptions?.signal; checkDriveSignal(signal);
      const session = requireConfigured(); validateOwner(ownerId); validateFileId(fileId);
      const token = await session.accessToken(ownerId, { signal }); const file = await metadata(token, fileId, signal);
      if (file.id !== fileId || file.trashed || file.shared || file.driveId || file.appProperties?.acfOwner !== ownerMarker(ownerId) || file.appProperties?.acfManaged !== '1' || file.mimeType.startsWith('application/vnd.google-apps.')) throw new DriveError('DRIVE_ACCESS_DENIED');
      const size = Number(file.size);
      if (!Number.isSafeInteger(size) || size < 1 || size > maxDownload) throw new DriveError('DRIVE_FILE_TOO_LARGE');
      const url = new URL(`${DRIVE_ENDPOINT}/${fileId}`); url.searchParams.set('alt', 'media');
      const result = await googleRequest(fetchImpl, url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal }, maxDownload, timeoutMs, 'drive');
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
