import { createHash, randomUUID } from 'node:crypto';
import { setMaxListeners } from 'node:events';
import { constants, closeSync, fchmodSync, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { lstat, open, realpath, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';
import { DRIVE_ERROR_CODES, MAX_MEDIA_BYTES, DriveError, validateOwner, type DriveIntegration, type DriveMedia, type DriveProjectFolders } from './types.js';

export interface ManagedProjectMedia {
  id: string; kind: 'clips' | 'exports' | 'audio' | 'images'; filePath: string; name: string; mimeType: string; sceneId?: string;
}
export interface TransferInfo {
  id: string; mediaId: string; kind: ManagedProjectMedia['kind']; sceneId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed'; progress: number; bytes: number; totalBytes: number;
  errorCode: string | null; file?: DriveMedia; createdAt: string; updatedAt: string;
}
export interface ProjectStorageState {
  projectId: string; prepared: boolean; folders: DriveProjectFolders | null; transfers: TransferInfo[];
  summary: { total: number; active: number; completed: number; failed: number };
}
export interface ProjectStorageOptions { privateDir: string; drive: DriveIntegration }

const safeName = z.string().min(1).max(255).refine(value => !['.', '..'].includes(value.trim()) && value.trim().length > 0 &&
  !/[\\/]/u.test(value) && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127));
const fileId = z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/);
const foldersSchema = z.strictObject({ rootId: fileId, projectFolderId: fileId, categories: z.strictObject({
  story: fileId, productReview: fileId, kidsToy: fileId, investment: fileId, sharedAssets: fileId, archives: fileId,
}) });
const mediaSchema = z.strictObject({ id: z.uuid(), kind: z.enum(['clips', 'exports', 'audio', 'images']),
  filePath: z.string().refine(isAbsolute), name: safeName, mimeType: z.string().max(128).regex(/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/)
    .refine(value => !value.startsWith('application/vnd.google-apps.')), sceneId: z.string().min(1).max(64).optional() });
const driveFileSchema = z.strictObject({ id: fileId, name: safeName, mimeType: z.string().min(1).max(128),
  size: z.number().int().min(1).max(MAX_MEDIA_BYTES), createdTime: z.iso.datetime().optional(), md5Checksum: z.string().regex(/^[a-f0-9]{32}$/), verified: z.literal(true) });
const transferSchema = z.strictObject({ id: z.uuid(), mediaId: z.uuid(), kind: z.enum(['clips', 'exports', 'audio', 'images']), sceneId: z.string().min(1).max(64).optional(),
  status: z.enum(['queued', 'running', 'completed', 'failed']), progress: z.number().int().min(0).max(100), bytes: z.number().int().min(0).max(MAX_MEDIA_BYTES),
  totalBytes: z.number().int().min(1).max(MAX_MEDIA_BYTES), errorCode: z.enum([...DRIVE_ERROR_CODES, 'INTERRUPTED']).nullable(),
  file: driveFileSchema.optional(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() });
const recordSchema = z.strictObject({ media: mediaSchema, info: transferSchema, attempt: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), md5Checksum: z.string().regex(/^[a-f0-9]{32}$/) }).refine(record =>
  record.info.mediaId === record.media.id && record.info.kind === record.media.kind && record.info.sceneId === record.media.sceneId &&
  record.info.bytes <= record.info.totalBytes && (record.info.status === 'completed' ? Boolean(record.info.file && record.info.progress === 100 &&
    record.info.bytes === record.info.totalBytes && record.info.file.size === record.info.totalBytes && record.info.file.md5Checksum === record.md5Checksum &&
    record.info.file.name === record.media.name && record.info.file.mimeType === record.media.mimeType && record.info.errorCode === null) : record.info.file === undefined));
const manifestSchema = z.strictObject({ version: z.literal(1), ownerId: z.uuid(), projectId: z.uuid(), folders: foldersSchema.nullable(), records: z.array(recordSchema).max(1000) })
  .refine(manifest => new Set(manifest.records.map(record => `${record.media.kind}:${record.media.id}`)).size === manifest.records.length &&
    new Set(manifest.records.map(record => record.info.id)).size === manifest.records.length);
type Manifest = z.infer<typeof manifestSchema>;
type RecordEntry = z.infer<typeof recordSchema>;
const now = () => new Date().toISOString();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const limit = 1024 * 1024;
const clone = <T>(value: T): T => structuredClone(value);

function restrict(fd: number, directory = false) {
  const info = fstatSync(fd);
  if (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1 || info.size > limit) throw new DriveError('DRIVE_VAULT_FAILED');
  if (process.platform !== 'win32') {
    if (!process.getuid || info.uid !== process.getuid()) throw new DriveError('DRIVE_VAULT_FAILED');
    fchmodSync(fd, directory ? 0o700 : 0o600);
  }
}
function checkSignal(signal: AbortSignal) { if (signal.aborted) throw new DriveError('DRIVE_REQUEST_FAILED'); }
async function fingerprint(media: ManagedProjectMedia, signal?: AbortSignal) {
  try {
    if (signal) checkSignal(signal);
    const info = await lstat(media.filePath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new DriveError('DRIVE_INVALID_INPUT');
    const filename = await realpath(media.filePath);
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > MAX_MEDIA_BYTES) throw new DriveError('DRIVE_FILE_TOO_LARGE');
      const sha = createHash('sha256'); const md5 = createHash('md5'); const buffer = Buffer.alloc(Math.min(before.size, 4 * 1024 * 1024));
      let offset = 0;
      while (offset < before.size) {
        if (signal) checkSignal(signal);
        const part = await handle.read(buffer, 0, Math.min(buffer.length, before.size - offset), offset);
        if (signal) checkSignal(signal);
        if (!part.bytesRead) throw new DriveError('DRIVE_INVALID_INPUT');
        sha.update(buffer.subarray(0, part.bytesRead)); md5.update(buffer.subarray(0, part.bytesRead)); offset += part.bytesRead;
      }
      const after = await handle.stat();
      if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new DriveError('DRIVE_INVALID_INPUT');
      return { filePath: filename, size: before.size, sha256: sha.digest('hex'), md5Checksum: md5.digest('hex') };
    } finally { await handle.close(); }
  } catch (error) { if (error instanceof DriveError) throw error; throw new DriveError('DRIVE_INVALID_INPUT'); }
}

// The caller resolves media/destination paths from its owned catalog, never browser input.
// Index files are private sidecars; this class does not alter the SQLite schema or replay uploads.
export class ProjectStorage {
  private directory: string;
  private drive: DriveIntegration;
  private active = new Map<string, { attempt: number; promise: Promise<void> }>();
  private preparations = new Map<string, Promise<void>>();
  private admissions = new Map<string, Promise<unknown>>();
  private restores = new Set<Promise<void>>();
  private recovered = new Set<string>();
  private projects = new Map<string, { ownerId: string; projectId: string }>();
  private shutdown = new AbortController();
  private stopping = false;
  private fenced = false;
  private stopPromise?: Promise<void>;
  constructor(options: ProjectStorageOptions) {
    this.directory = resolve(options.privateDir); this.drive = options.drive;
    // One listener per live operation is expected; each is removed when that operation settles.
    setMaxListeners(0, this.shutdown.signal);
  }
  private accepting() { if (this.stopping) throw new DriveError('DRIVE_REQUEST_FAILED'); }
  private key(ownerId: string, projectId: string) { return hash(`${validateOwner(ownerId)}:${validateOwner(projectId)}`); }
  private filename(ownerId: string, projectId: string) { return join(this.directory, `${this.key(ownerId, projectId)}.json`); }
  private ready() {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const info = lstatSync(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new DriveError('DRIVE_VAULT_FAILED');
    if (process.platform !== 'win32') {
      const fd = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { restrict(fd, true); } finally { closeSync(fd); }
    }
  }
  private read(ownerId: string, projectId: string): Manifest {
    const filename = this.filename(ownerId, projectId);
    const key = this.key(ownerId, projectId);
    this.projects.set(key, { ownerId, projectId });
    try {
      this.ready();
      const info = lstatSync(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > limit) throw new DriveError('DRIVE_VAULT_FAILED');
      const fd = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      let stored: string;
      try { restrict(fd); stored = readFileSync(fd, 'utf8'); } finally { closeSync(fd); }
      const manifest = manifestSchema.parse(JSON.parse(stored));
      if (manifest.ownerId !== ownerId || manifest.projectId !== projectId) throw new DriveError('DRIVE_VAULT_FAILED');
      let interrupted = false;
      if (!this.recovered.has(key)) for (const record of manifest.records) if (['queued', 'running'].includes(record.info.status) && this.active.get(record.info.id)?.attempt !== record.attempt) {
        record.info.status = 'failed'; record.info.errorCode = 'INTERRUPTED'; record.info.updatedAt = now(); interrupted = true;
      }
      if (interrupted) this.write(manifest);
      this.recovered.add(key);
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { this.recovered.add(key); return { version: 1, ownerId, projectId, folders: null, records: [] }; }
      throw new DriveError('DRIVE_VAULT_FAILED');
    }
  }
  private write(manifest: Manifest) {
    const filename = this.filename(manifest.ownerId, manifest.projectId); const temporary = join(this.directory, `${randomUUID()}.tmp`);
    try {
      this.ready();
      try {
        const info = lstatSync(filename);
        if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new DriveError('DRIVE_VAULT_FAILED');
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const payload = JSON.stringify(manifestSchema.parse(manifest));
      if (Buffer.byteLength(payload) > limit) throw new DriveError('DRIVE_VAULT_FAILED');
      const fd = openSync(temporary, 'wx', 0o600);
      try { restrict(fd); writeFileSync(fd, payload); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, filename);
      if (process.platform !== 'win32') {
        const directory = openSync(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try { fsyncSync(directory); } finally { closeSync(directory); }
      }
    } catch { throw new DriveError('DRIVE_VAULT_FAILED'); }
    finally { try { unlinkSync(temporary); } catch { /* Only this operation's private temporary file is removed. */ } }
  }
  state(ownerId: string, projectId: string): ProjectStorageState {
    const manifest = this.read(ownerId, projectId); const transfers = manifest.records.map(record => clone(record.info));
    return { projectId, prepared: Boolean(manifest.folders), folders: clone(manifest.folders), transfers,
      summary: { total: transfers.length, active: transfers.filter(info => ['queued', 'running'].includes(info.status)).length,
        completed: transfers.filter(info => info.status === 'completed').length, failed: transfers.filter(info => info.status === 'failed').length } };
  }
  async prepare(ownerId: string, project: { id: string; name: string }): Promise<ProjectStorageState> {
    this.accepting();
    return this.prepareAdmitted(ownerId, project);
  }
  private async prepareAdmitted(ownerId: string, project: { id: string; name: string }): Promise<ProjectStorageState> {
    checkSignal(this.shutdown.signal);
    const key = this.key(ownerId, project.id);
    if (!safeName.max(120).safeParse(project.name).success) throw new DriveError('DRIVE_INVALID_INPUT');
    if (this.read(ownerId, project.id).folders) return this.state(ownerId, project.id);
    let pending = this.preparations.get(key);
    if (!pending) {
      pending = (async () => {
        if (!this.drive.ensureProjectFolders) throw new DriveError('DRIVE_NOT_CONFIGURED');
        let folders: DriveProjectFolders;
        try { folders = foldersSchema.parse(await this.drive.ensureProjectFolders(ownerId, project.id, project.name, { signal: this.shutdown.signal })); }
        catch (error) { if (error instanceof DriveError) throw error; throw new DriveError('DRIVE_INVALID_OUTPUT'); }
        checkSignal(this.shutdown.signal);
        const manifest = this.read(ownerId, project.id); manifest.folders = folders; this.write(manifest);
      })();
      this.preparations.set(key, pending);
    }
    try { await this.untilClosed(pending); checkSignal(this.shutdown.signal); }
    finally { if (this.preparations.get(key) === pending) this.preparations.delete(key); }
    return this.state(ownerId, project.id);
  }
  async start(ownerId: string, project: { id: string; name: string }, media: ManagedProjectMedia): Promise<TransferInfo> {
    this.accepting();
    const key = this.key(ownerId, project.id);
    if (!safeName.max(120).safeParse(project.name).success) throw new DriveError('DRIVE_INVALID_INPUT');
    const validated = mediaSchema.safeParse(media);
    if (!validated.success) throw new DriveError('DRIVE_INVALID_INPUT');
    const request = (this.admissions.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
      this.accepting();
      const source = await fingerprint(validated.data, this.shutdown.signal); this.accepting();
      const normalized = { ...validated.data, filePath: source.filePath };
      const manifest = this.read(ownerId, project.id);
      let record = manifest.records.find(record => record.media.id === media.id && record.media.kind === media.kind);
      if (record) {
        if (JSON.stringify(record.media) !== JSON.stringify(normalized) || record.sha256 !== source.sha256 || record.info.totalBytes !== source.size) throw new DriveError('DRIVE_INVALID_INPUT');
        if (record.info.status !== 'failed') return clone(record.info);
        record.attempt++; record.info.status = 'queued'; record.info.bytes = 0; record.info.progress = 0; record.info.errorCode = null; record.info.updatedAt = now();
      } else {
        const timestamp = now();
        record = { media: normalized, sha256: source.sha256, md5Checksum: source.md5Checksum, attempt: 1,
          info: { id: randomUUID(), mediaId: media.id, kind: media.kind, ...(media.sceneId ? { sceneId: media.sceneId } : {}), status: 'queued',
            progress: 0, bytes: 0, totalBytes: source.size, errorCode: null, createdAt: timestamp, updatedAt: timestamp } };
        manifest.records.push(record);
      }
      // Register ownership before writing queued state so only a new process recovers it.
      const snapshot = clone(record.info); this.launch(ownerId, project, record, manifest); return snapshot;
    });
    this.admissions.set(key, request);
    try { return await this.untilClosed(request); }
    finally { if (this.admissions.get(key) === request) this.admissions.delete(key); }
  }
  private launch(ownerId: string, project: { id: string; name: string }, record: RecordEntry, manifest: Manifest) {
    const attempt = record.attempt;
    let launch!: () => void;
    const gate = new Promise<void>(resolve => { launch = resolve; });
    const promise = gate.then(() => this.run(ownerId, project, record.info.id, attempt)).catch(() => undefined)
      .finally(() => { if (this.active.get(record.info.id)?.attempt === attempt) this.active.delete(record.info.id); });
    this.active.set(record.info.id, { attempt, promise });
    try { this.write(manifest); launch(); }
    catch (error) { this.active.delete(record.info.id); launch(); throw error; }
  }
  private update(ownerId: string, projectId: string, id: string, attempt: number, action: (record: RecordEntry) => void): boolean {
    if (this.fenced) return false;
    const manifest = this.read(ownerId, projectId); const record = manifest.records.find(record => record.info.id === id);
    if (!record || record.attempt !== attempt || !['queued', 'running'].includes(record.info.status)) return false;
    action(record); record.info.updatedAt = now(); this.write(manifest); return true;
  }
  private async run(ownerId: string, project: { id: string; name: string }, id: string, attempt: number): Promise<void> {
    try {
      if (!this.update(ownerId, project.id, id, attempt, record => { record.info.status = 'running'; })) return;
      await this.prepareAdmitted(ownerId, project);
      if (this.fenced) return;
      const record = this.read(ownerId, project.id).records.find(record => record.info.id === id)!;
      if (record.attempt !== attempt || record.info.status !== 'running') return;
      const result = await this.drive.upload(ownerId, { name: record.media.name, mimeType: record.media.mimeType, filePath: record.media.filePath,
        project, idempotencyKey: `${record.media.kind}:${record.media.id}`, signal: this.shutdown.signal, onProgress: (bytes, total) => {
          if (this.fenced) return;
          if (!Number.isSafeInteger(bytes) || bytes < 0 || !Number.isSafeInteger(total) || total !== record.info.totalBytes || bytes > total) return;
          this.update(ownerId, project.id, id, attempt, current => {
            current.info.bytes = Math.max(current.info.bytes, bytes);
            current.info.progress = Math.max(current.info.progress, Math.min(99, Math.floor(current.info.bytes * 100 / total)));
          });
        } });
      if (this.fenced) return;
      const file = driveFileSchema.safeParse(result);
      if (!file.success || file.data.size !== record.info.totalBytes || file.data.md5Checksum !== record.md5Checksum || file.data.name !== record.media.name || file.data.mimeType !== record.media.mimeType) throw new DriveError('DRIVE_INVALID_OUTPUT');
      this.update(ownerId, project.id, id, attempt, current => { current.info.status = 'completed'; current.info.progress = 100;
        current.info.bytes = current.info.totalBytes; current.info.file = file.data; current.info.errorCode = null; });
    } catch (error) {
      this.update(ownerId, project.id, id, attempt, record => { record.info.status = 'failed'; record.info.errorCode = error instanceof DriveError ? error.code : 'DRIVE_REQUEST_FAILED'; });
    }
  }
  async wait(): Promise<void> {
    while (!this.fenced && (this.active.size || this.preparations.size || this.admissions.size || this.restores.size)) {
      try {
        await this.untilClosed(Promise.allSettled([...this.active.values()].map(entry => entry.promise).concat([...this.preparations.values()], [...this.admissions.values()].map(promise => promise.then(() => undefined)), [...this.restores])));
      } catch (error) { if (this.shutdown.signal.aborted) return; throw error; }
    }
  }
  private async untilClosed<T>(operation: Promise<T>): Promise<T> {
    checkSignal(this.shutdown.signal);
    let cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new DriveError('DRIVE_REQUEST_FAILED'));
      this.shutdown.signal.addEventListener('abort', cancel, { once: true });
    });
    try { return await Promise.race([operation, aborted]); }
    finally { this.shutdown.signal.removeEventListener('abort', cancel); }
  }
  // A stopped instance cannot retry ambiguous remote work. A new process may explicitly
  // retry using the same immutable adapter receipt and preallocated Drive file ID.
  stop(graceMs = 5000): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!Number.isSafeInteger(graceMs) || graceMs < 0 || graceMs > 60_000) return Promise.reject(new DriveError('DRIVE_INVALID_INPUT'));
    this.stopping = true;
    this.stopPromise = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (graceMs) await Promise.race([this.wait(), new Promise<void>(resolve => { timer = setTimeout(resolve, graceMs); })]);
      } finally {
        clearTimeout(timer);
        this.fenced = true; this.shutdown.abort();
        this.active.clear(); this.preparations.clear(); this.admissions.clear(); this.restores.clear();
      }
      for (const { ownerId, projectId } of this.projects.values()) {
        const manifest = this.read(ownerId, projectId); let changed = false;
        for (const record of manifest.records) if (['queued', 'running'].includes(record.info.status)) {
          record.info.status = 'failed'; record.info.errorCode = 'INTERRUPTED'; record.info.updatedAt = now(); changed = true;
        }
        if (changed) this.write(manifest);
      }
    })();
    return this.stopPromise;
  }
  async restore(ownerId: string, projectId: string, kind: ManagedProjectMedia['kind'], mediaId: string, destinationManagedPath: string): Promise<void> {
    this.accepting();
    const operation = this.restoreAdmitted(ownerId, projectId, kind, mediaId, destinationManagedPath);
    this.restores.add(operation);
    try { await this.untilClosed(operation); }
    finally { this.restores.delete(operation); }
  }
  private async restoreAdmitted(ownerId: string, projectId: string, kind: ManagedProjectMedia['kind'], mediaId: string, destinationManagedPath: string): Promise<void> {
    checkSignal(this.shutdown.signal);
    validateOwner(mediaId);
    const record = this.read(ownerId, projectId).records.find(record => record.media.kind === kind && record.media.id === mediaId);
    if (!record?.info.file || record.info.status !== 'completed') throw new DriveError('DRIVE_NOT_FOUND');
    if (!isAbsolute(destinationManagedPath)) throw new DriveError('DRIVE_INVALID_INPUT');
    const destination = resolve(destinationManagedPath);
    try {
      try {
        await lstat(destination);
        const current = await fingerprint({ ...record.media, filePath: destination }, this.shutdown.signal);
        if (current.size !== record.info.totalBytes || current.sha256 !== record.sha256) throw new DriveError('DRIVE_INVALID_INPUT');
        return;
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const parent = await lstat(dirname(destination));
      if (!parent.isDirectory() || parent.isSymbolicLink()) throw new DriveError('DRIVE_INVALID_INPUT');
      checkSignal(this.shutdown.signal);
      const bytes = await this.drive.download(ownerId, record.info.file.id, { signal: this.shutdown.signal });
      checkSignal(this.shutdown.signal);
      if (bytes.byteLength !== record.info.totalBytes || createHash('md5').update(bytes).digest('hex') !== record.md5Checksum ||
          createHash('sha256').update(bytes).digest('hex') !== record.sha256) throw new DriveError('DRIVE_INVALID_OUTPUT');
      const temporary = join(dirname(destination), `${randomUUID()}.tmp`);
      try {
        checkSignal(this.shutdown.signal);
        const handle = await open(temporary, 'wx', 0o600);
        try { checkSignal(this.shutdown.signal); await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
        // link is an atomic exclusive publish. rename could overwrite a file created during download.
        // Synchronous publish keeps the final abort check and filesystem commit in one JS turn.
        checkSignal(this.shutdown.signal); linkSync(temporary, destination);
        if (process.platform !== 'win32') {
          const directory = await open(dirname(destination), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
          try { await directory.sync(); } finally { await directory.close(); }
        }
      } finally { await rm(temporary, { force: true }); }
    } catch (error) { if (error instanceof DriveError) throw error; throw new DriveError('DRIVE_INVALID_INPUT'); }
  }
}
