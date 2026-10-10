import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AUTHORIZATION_ENDPOINT, DRIVE_SCOPE, TOKEN_ENDPOINT, DriveError, googleRequest, checkDriveSignal, validateOwner,
  type DriveOptions, type OAuthCallback, type SessionValidator, type TokenSet } from './types.js';
import { TokenVault } from './vault.js';

export interface OAuthConfiguration { clientId: string; clientSecret: string; redirectUri: string }
interface PendingState { ownerId: string; sessionHash: string; verifier: string; expiresAt: number }
interface RefreshRequest { promise: Promise<string>; abort: AbortController; waiters: number; settled: boolean }
const TokenResponseSchema = z.object({
  access_token: z.string().min(1).max(8192).refine(value => !/[\r\n]/.test(value)),
  token_type: z.literal('Bearer'), expires_in: z.number().int().min(1).max(86400),
  refresh_token: z.string().min(1).max(8192).refine(value => !/[\r\n]/.test(value)).optional(),
  refresh_token_expires_in: z.number().int().positive().max(315360000).optional(), scope: z.string().max(4096).optional(),
});
const stateHash = (state: string) => createHash('sha256').update(state).digest('hex');

// Only the exact registered URI may be selected; request headers/query parameters never select it.
export function oauthConfiguration(options: DriveOptions): OAuthConfiguration | null {
  if (!options.clientId || !/^[a-zA-Z0-9._-]{1,1024}$/.test(options.clientId) || !options.clientSecret ||
      !/^[a-zA-Z0-9_-]{1,4096}$/.test(options.clientSecret) || !options.redirectUri ||
      !options.allowedRedirectUris?.includes(options.redirectUri)) return null;
  try {
    const redirect = new URL(options.redirectUri);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(redirect.hostname);
    if (redirect.username || redirect.password || redirect.search || redirect.hash || /\\|%2f|%5c|%2e/i.test(options.redirectUri) ||
        !(redirect.protocol === 'https:' || (redirect.protocol === 'http:' && loopback))) return null;
    return { clientId: options.clientId, clientSecret: options.clientSecret, redirectUri: options.redirectUri };
  } catch { return null; }
}

export class DriveOAuth {
  private states = new Map<string, PendingState>();
  private locks = new Map<string, Promise<unknown>>();
  private refreshes = new Map<string, RefreshRequest>();
  private now: () => number;
  private fetchImpl: typeof fetch;
  private timeoutMs: number;
  private stateTtlMs: number;
  constructor(private config: OAuthConfiguration, private vault: TokenVault, options: DriveOptions) {
    this.now = options.now ?? Date.now; this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000; this.stateTtlMs = options.stateTtlMs ?? 10 * 60_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000 ||
        !Number.isInteger(this.stateTtlMs) || this.stateTtlMs < 1 || this.stateTtlMs > 10 * 60_000) throw new DriveError('DRIVE_INVALID_INPUT');
  }
  private async serialized<T>(ownerId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(ownerId) ?? Promise.resolve();
    const operation = previous.catch(() => undefined).then(task);
    this.locks.set(ownerId, operation);
    try { return await operation; }
    finally { if (this.locks.get(ownerId) === operation) this.locks.delete(ownerId); }
  }
  async begin(ownerId: string, sessionHash: string): Promise<{ authorizationUrl: string }> {
    validateOwner(ownerId);
    if (!/^[a-f0-9]{64}$/.test(sessionHash)) throw new DriveError('DRIVE_INVALID_INPUT');
    for (const [key, value] of this.states) {
      if (value.expiresAt <= this.now() || value.ownerId === ownerId) this.states.delete(key);
    }
    if (this.states.size >= 1000) throw new DriveError('DRIVE_RATE_LIMITED');
    const state = randomBytes(32).toString('base64url'); const verifier = randomBytes(32).toString('base64url');
    this.states.set(stateHash(state), { ownerId, sessionHash, verifier, expiresAt: this.now() + this.stateTtlMs });
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri,
      response_type: 'code', scope: DRIVE_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return { authorizationUrl: url.toString() };
  }
  async callback(input: OAuthCallback, validateSessionHash: SessionValidator): Promise<void> {
    if (typeof input.state !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(input.state)) throw new DriveError('DRIVE_STATE_INVALID');
    const key = stateHash(input.state); const state = this.states.get(key);
    this.states.delete(key); // Consume before awaits, including rejected/denied callback attempts.
    if (!state || state.expiresAt <= this.now()) throw new DriveError('DRIVE_STATE_INVALID');
    await this.serialized(state.ownerId, async () => {
      if (state.expiresAt <= this.now()) throw new DriveError('DRIVE_STATE_INVALID');
      const liveSession = async () => {
        try { return await validateSessionHash(state.ownerId, state.sessionHash); }
        catch { return false; }
      };
      if (!await liveSession()) throw new DriveError('DRIVE_STATE_INVALID');
      if (input.error || typeof input.code !== 'string' || input.code.length < 1 || input.code.length > 8192) throw new DriveError('DRIVE_AUTH_FAILED');
      const previous = await this.vault.read(state.ownerId);
      const result = await this.tokenRequest(new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret,
        code: input.code, code_verifier: state.verifier, redirect_uri: this.config.redirectUri, grant_type: 'authorization_code' }));
      const tokens = this.tokens(result, previous, false);
      if (!await liveSession() || state.expiresAt <= this.now()) throw new DriveError('DRIVE_STATE_INVALID');
      await this.vault.write(state.ownerId, tokens);
    });
  }
  private async tokenRequest(body: URLSearchParams, signal?: AbortSignal): Promise<z.infer<typeof TokenResponseSchema>> {
    const bytes = await googleRequest(this.fetchImpl, TOKEN_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal }, 32 * 1024, this.timeoutMs, 'oauth');
    try { return TokenResponseSchema.parse(JSON.parse(Buffer.from(bytes).toString('utf8'))); }
    catch { throw new DriveError('DRIVE_INVALID_OUTPUT'); }
  }
  private tokens(response: z.infer<typeof TokenResponseSchema>, previous: TokenSet | null, refresh: boolean): TokenSet {
    const scope = response.scope ?? (refresh ? previous?.scope : undefined);
    if (scope?.trim() !== DRIVE_SCOPE) throw new DriveError('DRIVE_ACCESS_DENIED');
    // An authorization-code grant must provide its own refresh token. Never mix grants/accounts.
    const refreshToken = response.refresh_token ?? (refresh ? previous?.refreshToken : undefined);
    if (!refreshToken) throw new DriveError('DRIVE_AUTH_FAILED');
    const refreshExpiresAt = response.refresh_token_expires_in ? this.now() + response.refresh_token_expires_in * 1000 :
      refresh ? previous?.refreshExpiresAt : undefined;
    return { accessToken: response.access_token, refreshToken, expiresAt: this.now() + response.expires_in * 1000, scope: DRIVE_SCOPE,
      ...(refreshExpiresAt ? { refreshExpiresAt } : {}) };
  }
  async connected(ownerId: string): Promise<boolean> {
    validateOwner(ownerId);
    const tokens = await this.vault.read(ownerId);
    if (!tokens || tokens.reauthorizationRequired) return false;
    return tokens.expiresAt > this.now() + 30_000 || Boolean(tokens.refreshToken && (!tokens.refreshExpiresAt || tokens.refreshExpiresAt > this.now()));
  }
  async accessToken(ownerId: string, options?: { signal?: AbortSignal }): Promise<string> {
    validateOwner(ownerId);
    const signal = options?.signal; checkDriveSignal(signal);
    let pending = this.refreshes.get(ownerId);
    if (!pending) {
      const abort = new AbortController();
      const operation = this.serialized(ownerId, async () => {
        checkDriveSignal(abort.signal);
        const previous = await this.vault.read(ownerId);
        checkDriveSignal(abort.signal);
        if (!previous) throw new DriveError('DRIVE_NOT_CONNECTED');
        if (previous.reauthorizationRequired) throw new DriveError('DRIVE_AUTH_FAILED');
        if (previous.expiresAt > this.now() + 30_000) return previous.accessToken;
        if (!previous.refreshToken || (previous.refreshExpiresAt && previous.refreshExpiresAt <= this.now())) throw new DriveError('DRIVE_AUTH_FAILED');
        let result: z.infer<typeof TokenResponseSchema>;
        try { result = await this.tokenRequest(new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: previous.refreshToken, grant_type: 'refresh_token' }), abort.signal); }
        catch (error) {
          if (error instanceof DriveError && error.code === 'DRIVE_AUTH_FAILED') await this.vault.write(ownerId, { ...previous, reauthorizationRequired: true });
          throw error;
        }
        checkDriveSignal(abort.signal);
        const tokens = this.tokens(result, previous, true);
        await this.vault.write(ownerId, tokens);
        return tokens.accessToken;
      });
      pending = { promise: operation, abort, waiters: 0, settled: false };
      this.refreshes.set(ownerId, pending);
      const current = pending;
      const cleanup = () => { current.settled = true; if (this.refreshes.get(ownerId) === current) this.refreshes.delete(ownerId); };
      void operation.then(cleanup, cleanup);
    }
    checkDriveSignal(pending.abort.signal);
    const current = pending; current.waiters++;
    let cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new DriveError('DRIVE_REQUEST_FAILED'));
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
    try { return await Promise.race([current.promise, aborted]); }
    finally {
      signal?.removeEventListener('abort', cancel);
      // Cancelling one subscriber must not abort another concurrent caller's refresh.
      if (--current.waiters === 0 && !current.settled) current.abort.abort();
    }
  }
}
