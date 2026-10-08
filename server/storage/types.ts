import { z } from 'zod';
import type { DriveStatus } from '../../shared/integrations.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const DRIVE_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
export const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
export const MAX_MULTIPART_BYTES = 5 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 128 * 1024 * 1024;
export const DRIVE_ERROR_CODES = [
  'DRIVE_NOT_CONFIGURED', 'DRIVE_NOT_CONNECTED', 'DRIVE_INVALID_INPUT', 'DRIVE_STATE_INVALID',
  'DRIVE_AUTH_FAILED', 'DRIVE_ACCESS_DENIED', 'DRIVE_NOT_FOUND', 'DRIVE_RATE_LIMITED',
  'DRIVE_REQUEST_FAILED', 'DRIVE_TIMEOUT', 'DRIVE_INVALID_OUTPUT', 'DRIVE_VAULT_FAILED', 'DRIVE_FILE_TOO_LARGE',
] as const;
export type DriveErrorCode = typeof DRIVE_ERROR_CODES[number];
export class DriveError extends Error {
  constructor(public readonly code: DriveErrorCode) { super(code); this.name = 'DriveError'; }
}

const TokenString = z.string().min(1).max(8192).refine(value => !/[\r\n]/.test(value));
export const TokenSetSchema = z.strictObject({
  accessToken: TokenString, refreshToken: TokenString.optional(), expiresAt: z.number().int().positive(),
  refreshExpiresAt: z.number().int().positive().optional(), scope: z.literal(DRIVE_SCOPE),
  reauthorizationRequired: z.boolean().optional(),
});
export type TokenSet = z.infer<typeof TokenSetSchema>;
export interface DriveMedia { id: string; name: string; mimeType: string; size: number; createdTime?: string }
export type DriveUpload = { name: string; mimeType: string; parentId?: string } &
  ({ bytes: Uint8Array; filePath?: never } | { filePath: string; bytes?: never });
export type SessionValidator = (ownerId: string, sessionHash: string) => boolean | Promise<boolean>;
export interface OAuthCallback { state: string; code?: string; error?: string }
export interface DriveIntegration {
  status(ownerId: string): Promise<DriveStatus>;
  begin(ownerId: string, sessionHash: string): Promise<{ authorizationUrl: string }>;
  callback(input: OAuthCallback, validateSessionHash: SessionValidator): Promise<void>;
  upload(ownerId: string, input: DriveUpload): Promise<DriveMedia>;
  download(ownerId: string, fileId: string): Promise<Uint8Array>;
}
export interface DriveOptions {
  privateDir: string; clientId?: string; clientSecret?: string; redirectUri?: string;
  allowedRedirectUris?: string[]; encryptionKey?: Uint8Array; defaultParentId?: string;
  allowedFileRoots?: string[]; fetchImpl?: typeof fetch; now?: () => number;
  timeoutMs?: number; stateTtlMs?: number; maxDownloadBytes?: number;
}

export function validateOwner(ownerId: string): string {
  const result = z.uuid().safeParse(ownerId);
  if (!result.success) throw new DriveError('DRIVE_INVALID_INPUT');
  return result.data;
}
export function validateFileId(fileId: string): string {
  if (typeof fileId !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(fileId)) throw new DriveError('DRIVE_INVALID_INPUT');
  return fileId;
}

export function validateUploadSession(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== 'https://www.googleapis.com' || parsed.pathname !== '/upload/drive/v3/files' ||
        parsed.username || parsed.password || parsed.hash || parsed.searchParams.get('uploadType') !== 'resumable' ||
        !/^[a-zA-Z0-9_-]{1,2048}$/.test(parsed.searchParams.get('upload_id') ?? '') ||
        [...parsed.searchParams.keys()].some(key => !['uploadType', 'upload_id'].includes(key)) ||
        parsed.searchParams.getAll('uploadType').length !== 1 || parsed.searchParams.getAll('upload_id').length !== 1) throw new Error();
    return url;
  } catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
}

function permittedEndpoint(url: string, method: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password || parsed.hash) return false;
    if (url === TOKEN_ENDPOINT) return method === 'POST';
    if (parsed.origin !== 'https://www.googleapis.com') return false;
    if (/^\/drive\/v3\/files\/[a-zA-Z0-9_-]{1,256}$/.test(parsed.pathname)) return method === 'GET';
    if (parsed.pathname !== '/upload/drive/v3/files') return false;
    if (method === 'PUT') { validateUploadSession(url); return true; }
    return method === 'POST' && ['multipart', 'resumable'].includes(parsed.searchParams.get('uploadType') ?? '') &&
      [...parsed.searchParams.keys()].every(key => ['uploadType', 'fields'].includes(key));
  } catch { return false; }
}

// All callers supply fixed Google endpoints. Redirects and upstream error bodies are rejected.
// The timeout covers both connection and bounded streamed response consumption.
export interface GoogleResponse { status: number; headers: Headers; bytes: Uint8Array }
export async function googleResponse(fetchImpl: typeof fetch, url: string, init: RequestInit,
  maxBytes: number, timeoutMs: number, kind: 'oauth' | 'drive', allowedStatuses: number[] = []): Promise<GoogleResponse> {
  if (!permittedEndpoint(url, init.method ?? 'GET')) throw new DriveError('DRIVE_INVALID_INPUT');
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { abort.abort(); reject(new DriveError('DRIVE_TIMEOUT')); }, timeoutMs);
  });
  const operation = async () => {
    const response = await fetchImpl(url, { ...init, redirect: 'manual', signal: abort.signal });
    if (response.redirected || (response.url && response.url !== url) || (!response.ok && !allowedStatuses.includes(response.status))) {
      void response.body?.cancel().catch(() => undefined);
      const code = response.status === 429 ? 'DRIVE_RATE_LIMITED' : response.status === 404 ? 'DRIVE_NOT_FOUND' :
        kind === 'oauth' && [400, 401, 403].includes(response.status) ? 'DRIVE_AUTH_FAILED' :
          [401, 403].includes(response.status) ? 'DRIVE_ACCESS_DENIED' : 'DRIVE_REQUEST_FAILED';
      throw new DriveError(code);
    }
    const length = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(length) && length > maxBytes) {
      void response.body?.cancel().catch(() => undefined);
      throw new DriveError('DRIVE_FILE_TOO_LARGE');
    }
    if (!response.body) return { status: response.status, headers: response.headers, bytes: new Uint8Array() };
    const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    abort.signal.addEventListener('abort', cancel, { once: true });
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw new DriveError('DRIVE_FILE_TOO_LARGE'); }
        chunks.push(part.value);
      }
    } finally { abort.signal.removeEventListener('abort', cancel); reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { status: response.status, headers: response.headers, bytes };
  };
  try { return await Promise.race([operation(), deadline]); }
  catch (error) {
    if (error instanceof DriveError) throw error;
    throw new DriveError(abort.signal.aborted ? 'DRIVE_TIMEOUT' : 'DRIVE_REQUEST_FAILED');
  } finally { clearTimeout(timer); }
}

export async function googleRequest(fetchImpl: typeof fetch, url: string, init: RequestInit,
  maxBytes: number, timeoutMs: number, kind: 'oauth' | 'drive'): Promise<Uint8Array> {
  return (await googleResponse(fetchImpl, url, init, maxBytes, timeoutMs, kind)).bytes;
}
