import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, lstat, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { DriveError, TokenSetSchema, validateOwner, type TokenSet } from './types.js';

const EnvelopeSchema = z.strictObject({ version: z.literal(1), iv: z.string().length(24), tag: z.string().length(32), ciphertext: z.string().min(2).max(65536) });

export class TokenVault {
  private readonly directory: string;
  private readonly key: Buffer;
  constructor(directory: string, encryptionKey: Uint8Array) {
    if (encryptionKey.byteLength !== 32) throw new DriveError('DRIVE_NOT_CONFIGURED');
    this.directory = resolve(directory); this.key = Buffer.from(encryptionKey);
  }
  private filename(ownerId: string) {
    return join(this.directory, `${createHash('sha256').update(validateOwner(ownerId)).digest('hex')}.json`);
  }
  private aad(ownerId: string) { return Buffer.from(`acf-drive-token-v1:${validateOwner(ownerId)}`); }
  private async restrictPermissions(handle: FileHandle, kind: 'directory' | 'file') {
    const info = await handle.stat();
    if (kind === 'directory' ? !info.isDirectory() : !info.isFile() || info.nlink !== 1) throw new DriveError('DRIVE_VAULT_FAILED');
    // Unix modes do not describe Windows ACLs. Preserve Windows ACLs; encryption is still required.
    if (process.platform === 'win32') return;
    if (!process.getuid || info.uid !== process.getuid()) throw new DriveError('DRIVE_VAULT_FAILED');
    const mode = kind === 'directory' ? 0o700 : 0o600;
    if ((info.mode & 0o7777) !== mode) await handle.chmod(mode);
    if (((await handle.stat()).mode & 0o7777) !== mode) throw new DriveError('DRIVE_VAULT_FAILED');
  }
  private async prepare(create: boolean) {
    if (create) await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directory = await lstat(this.directory);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw new DriveError('DRIVE_VAULT_FAILED');
    if (process.platform !== 'win32') {
      const handle = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
      try { await this.restrictPermissions(handle, 'directory'); } finally { await handle.close(); }
    }
  }
  private async openToken(filename: string): Promise<FileHandle> {
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 65536) throw new DriveError('DRIVE_VAULT_FAILED');
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      await this.restrictPermissions(handle, 'file');
      if ((await handle.stat()).size > 65536) throw new DriveError('DRIVE_VAULT_FAILED');
      return handle;
    } catch (error) { await handle.close().catch(() => undefined); throw error; }
  }
  async read(ownerId: string): Promise<TokenSet | null> {
    const filename = this.filename(ownerId);
    try {
      await this.prepare(false);
      const handle = await this.openToken(filename);
      let stored: string;
      try { stored = await handle.readFile('utf8'); } finally { await handle.close(); }
      const envelope = EnvelopeSchema.parse(JSON.parse(stored));
      if (!/^[a-f0-9]{24}$/.test(envelope.iv) || !/^[a-f0-9]{32}$/.test(envelope.tag) || !/^(?:[a-f0-9]{2})+$/.test(envelope.ciphertext)) throw new DriveError('DRIVE_VAULT_FAILED');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'hex'));
      decipher.setAAD(this.aad(ownerId)); decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'hex')), decipher.final()]);
      try { return TokenSetSchema.parse(JSON.parse(plaintext.toString('utf8'))); }
      finally { plaintext.fill(0); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new DriveError('DRIVE_VAULT_FAILED');
    }
  }
  async write(ownerId: string, input: TokenSet): Promise<void> {
    const filename = this.filename(ownerId); const temporary = join(this.directory, `${randomUUID()}.tmp`);
    let plaintext: Buffer | undefined;
    try {
      const tokens = TokenSetSchema.parse(input);
      await this.prepare(true);
      try { const existing = await this.openToken(filename); await existing.close(); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(this.aad(ownerId)); plaintext = Buffer.from(JSON.stringify(tokens));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope = JSON.stringify({ version: 1, iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('hex') });
      const handle = await open(temporary, 'wx', 0o600);
      try { await this.restrictPermissions(handle, 'file'); await handle.writeFile(envelope); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, filename);
    } catch { throw new DriveError('DRIVE_VAULT_FAILED'); }
    finally { plaintext?.fill(0); await rm(temporary, { force: true }).catch(() => undefined); }
  }
}
