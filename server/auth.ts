import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { User } from '../shared/contracts.js';
import type { Store } from './store.js';
import { AppError } from './errors.js';

const COOKIE = 'acf_session';
const SESSION_MS = 12 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, result) => error ? reject(error) : resolve(result)));
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const [, salt, hash] = (stored ?? '').split(':');
  const candidate = await derive(password, salt && /^[a-f0-9]{32}$/.test(salt) ? salt : '00000000000000000000000000000000');
  const expected = hash && /^[a-f0-9]{128}$/.test(hash) ? Buffer.from(hash, 'hex') : Buffer.alloc(64);
  return timingSafeEqual(candidate, expected) && stored !== null;
}
export class Auth {
  private attempts = new Map<string, { count: number; expires: number }>();
  constructor(private store: Store, private secure: boolean) {}
  token(req: Request): string | null {
    const values = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${COOKIE}=`));
    if (values.length !== 1) return null;
    const value = values[0].slice(COOKIE.length + 1);
    return /^[a-f0-9]{64}$/.test(value) ? value : null;
  }
  state(req: Request) {
    const token = this.token(req);
    const session = token ? this.store.session(digest(token)) : null;
    return { user: session?.user ?? null, csrfToken: session?.csrfToken ?? null, setupRequired: !this.store.hasOwner() };
  }
  require(req: Request) {
    const state = this.state(req);
    if (!state.user) throw new AppError('AUTH_REQUIRED', 401);
    return { user: state.user, csrfToken: state.csrfToken! };
  }
  csrf(req: Request, expected: string) {
    const value = req.get('X-CSRF-Token') ?? '';
    const received = Buffer.from(value); const target = Buffer.from(expected);
    if (received.length !== target.length || !timingSafeEqual(received, target)) throw new AppError('CSRF_INVALID', 403);
  }
  issue(res: Response, user: User) {
    const token = randomBytes(32).toString('hex'); const csrfToken = randomBytes(32).toString('hex');
    this.store.createSession(digest(token), user.id, csrfToken, Date.now() + SESSION_MS);
    res.cookie(COOKIE, token, { httpOnly: true, secure: this.secure, sameSite: 'strict', path: '/', maxAge: SESSION_MS });
    return { user, csrfToken, setupRequired: false };
  }
  logout(req: Request, res: Response) {
    const token = this.token(req);
    if (token) this.store.revokeSession(digest(token));
    res.clearCookie(COOKIE, { httpOnly: true, secure: this.secure, sameSite: 'strict', path: '/' });
  }
  throttle(ip: string) {
    const timestamp = Date.now();
    for (const [key, value] of this.attempts) if (value.expires <= timestamp) this.attempts.delete(key);
    const attempt = this.attempts.get(ip);
    if (attempt && attempt.count >= 10) throw new AppError('RATE_LIMITED', 429);
    if (!attempt && this.attempts.size >= 1000) throw new AppError('RATE_LIMITED', 429);
    this.attempts.set(ip, { count: (attempt?.count ?? 0) + 1, expires: attempt?.expires ?? timestamp + 15 * 60 * 1000 });
  }
  loginSucceeded(ip: string) { this.attempts.delete(ip); }
}
