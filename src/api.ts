import { ERROR_CODES, type ErrorCode } from '../shared/contracts';

export class RequestError extends Error {
  constructor(public readonly code: ErrorCode | 'NETWORK_ERROR') { super(code); }
}
export function knownError(code: unknown): ErrorCode | undefined {
  return typeof code === 'string' ? ERROR_CODES.find((item) => item === code) : undefined;
}
async function response(path: string, options: RequestInit, csrf?: string | null): Promise<Response> {
  const headers = new Headers(options.headers);
  if (csrf) headers.set('X-CSRF-Token', csrf);
  let result: Response;
  try { result = await fetch(`/api${path}`, { ...options, headers, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) { if (options.signal?.aborted) throw error; throw new RequestError('NETWORK_ERROR'); }
  if (!result.ok) {
    const body: unknown = await result.json().catch(() => null);
    const code = body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error
      ? knownError(body.error.code) : undefined;
    throw new RequestError(code ?? (result.status === 401 ? 'AUTH_REQUIRED' : 'INTERNAL_ERROR'));
  }
  return result;
}
export async function request<T>(path: string, options: RequestInit = {}, csrf?: string | null): Promise<T> {
  const result = await response(path, options, csrf);
  try { return await result.json() as T; } catch { throw new RequestError('INTERNAL_ERROR'); }
}
export function jsonBody(input: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) };
}
export async function download(path: string, name: string, signal?: AbortSignal): Promise<void> {
  const result = await response(path, { signal });
  const blob = await result.blob();
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
