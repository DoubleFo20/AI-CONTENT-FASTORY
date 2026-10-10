import { setMaxListeners } from 'node:events';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from './errors.js';

// Response/socket completion is separate from handler completion. Track returned
// promises, and guard resumed continuations before they access private state.
export class RequestLifecycle {
  private abort = new AbortController();
  private tasks = new Set<Promise<unknown>>();
  private waiters = new Set<() => void>();
  readonly signal = this.abort.signal;
  constructor() { setMaxListeners(0, this.signal); }
  guard(): void { if (this.signal.aborted) throw new AppError('INTERRUPTED', 503); }
  cancel(): void { this.abort.abort(); }
  track<T>(operation: Promise<T>): Promise<T> {
    this.tasks.add(operation);
    const settled = () => {
      this.tasks.delete(operation);
      if (!this.tasks.size) { for (const resolve of this.waiters) resolve(); this.waiters.clear(); }
    };
    void operation.then(settled, settled);
    return operation;
  }
  async race<T>(operation: Promise<T>): Promise<T> {
    // Attach a rejection consumer even when cancellation happened before admission.
    if (this.signal.aborted) { void operation.catch(() => undefined); this.guard(); }
    let cancel!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      cancel = () => reject(new AppError('INTERRUPTED', 503));
      this.signal.addEventListener('abort', cancel, { once: true });
    });
    try { const value = await Promise.race([operation, aborted]); this.guard(); return value; }
    finally { this.signal.removeEventListener('abort', cancel); }
  }
  async drain(timeoutMs = 5000): Promise<void> {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000) throw new AppError('INVALID_INPUT');
    if (!this.tasks.size || timeoutMs === 0) return;
    let release!: () => void; let timer: ReturnType<typeof setTimeout> | undefined;
    const empty = new Promise<void>(resolve => { release = resolve; this.waiters.add(resolve); });
    try { await Promise.race([empty, new Promise<void>(resolve => { timer = setTimeout(resolve, timeoutMs); })]); }
    finally { clearTimeout(timer); this.waiters.delete(release); }
  }
  middleware: RequestHandler = (_req, _res, next) => { try { this.guard(); next(); } catch (error) { next(error); } };
  // Registration only: preserve Express settings lookup, this binding, chaining,
  // arrays of handlers and four-argument error handlers. No router internals change.
  routes(app: Express): Express {
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all']);
    const wrap = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(wrap);
      if (typeof value !== 'function' || value.length === 4) return value;
      return (req: Request, res: Response, next: NextFunction) => {
        try {
          this.guard();
          const result: unknown = value(req, res, next);
          return result && typeof (result as Promise<unknown>).then === 'function' ? this.track(Promise.resolve(result)) : result;
        } catch (error) { next(error); }
      };
    };
    const facade: Express = new Proxy(app, { get: (target, property, receiver) => {
      const method: unknown = Reflect.get(target, property, receiver);
      if (!methods.has(String(property)) || typeof method !== 'function') return method;
      return (...args: unknown[]) => {
        const result: unknown = Reflect.apply(method, target, args.length === 1 ? args : [args[0], ...args.slice(1).map(wrap)]);
        return result === target ? facade : result;
      };
    } });
    return facade;
  }
  async multipart(middleware: RequestHandler, req: Request, res: Response, cleanup: () => Promise<void>): Promise<void> {
    this.guard();
    const abort = () => { req.destroy(); };
    const parsed = this.track(new Promise<void>((resolve, reject) => {
      this.signal.addEventListener('abort', abort, { once: true });
      try {
        middleware(req, res, error => {
          this.signal.removeEventListener('abort', abort);
          // A completed request body can leave diskStorage finishing after abort.
          // req.file is assigned only in this callback, after the route's raced
          // catch may have run. Keep parser tracking through late owned-file cleanup.
          if (this.signal.aborted) void cleanup().then(() => reject(new AppError('INTERRUPTED', 503)), reject);
          else if (error) reject(error); else resolve();
        });
      } catch (error) { this.signal.removeEventListener('abort', abort); reject(error); }
    }));
    await this.race(parsed);
  }
}
