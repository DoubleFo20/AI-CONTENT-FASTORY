import type { CloudJobInput, CloudLease, CloudRepository } from '../../shared/integrations.js';
import { AppError } from '../errors.js';
import { safeFailure } from './memory.js';

interface RunnerOptions {
  repository: CloudRepository; workerId: string; target?: 'cloud' | 'local';
  execute: (input: CloudJobInput, signal: AbortSignal) => Promise<unknown>;
  maxRunMs?: number; heartbeatMs?: number;
}
/** Bounded, one-at-a-time executor. Hosting/pairing and provider credentials are separate gates. */
export class CloudRunner {
  private pending: Promise<boolean> | null = null;
  private stopping = false;
  private controller: AbortController | null = null;
  private readonly maxRunMs: number;
  private readonly heartbeatMs: number;
  constructor(private readonly options: RunnerOptions) {
    this.maxRunMs = options.maxRunMs ?? 120000; this.heartbeatMs = options.heartbeatMs ?? 5000;
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(options.workerId) || !Number.isInteger(this.maxRunMs) || this.maxRunMs < 1 || this.maxRunMs > 600000 || !Number.isInteger(this.heartbeatMs) || this.heartbeatMs < 1 || this.heartbeatMs > 10000) throw new AppError('INVALID_INPUT');
  }
  runNext(): Promise<boolean> {
    if (this.stopping) return Promise.resolve(false);
    if (!this.pending) this.pending = this.run().finally(() => { this.pending = null; });
    return this.pending;
  }
  async drain(maxJobs = 10): Promise<number> {
    if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) throw new AppError('INVALID_INPUT');
    let completed = 0; while (completed < maxJobs && await this.runNext()) completed += 1; return completed;
  }
  async stop(): Promise<void> { this.stopping = true; this.controller?.abort(); await this.pending; }
  private async run(): Promise<boolean> {
    const lease = await this.options.repository.claim(this.options.workerId, this.options.target ?? 'cloud');
    if (!lease) return false;
    this.controller = new AbortController();
    if (this.stopping) this.controller.abort();
    const controller = this.controller;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let rejectInterrupt: (error: AppError) => void = () => {};
    const interrupt = new Promise<never>((_, reject) => { rejectInterrupt = reject; });
    const onAbort = () => rejectInterrupt(new AppError('INTERRUPTED', 409));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
    const beat = async () => {
      try { if (!await this.options.repository.heartbeat(lease, 10)) controller.abort(); }
      catch { controller.abort(); }
      if (!controller.signal.aborted) heartbeat = setTimeout(() => { void beat(); }, this.heartbeatMs);
    };
    const timer = setTimeout(() => controller.abort(), this.maxRunMs);
    heartbeat = setTimeout(() => { void beat(); }, this.heartbeatMs);
    try {
      const operation = async () => {
        if (controller.signal.aborted) throw new AppError('INTERRUPTED', 409);
        const result = await this.options.execute(lease.input, controller.signal);
        if (!controller.signal.aborted) await this.options.repository.complete(lease, result);
      };
      await Promise.race([operation(), interrupt]);
    } catch (error) {
      const code = error instanceof AppError ? error.code : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? safeFailure(error.code) : 'INTERNAL_ERROR';
      await this.safeFail(lease, code);
    } finally {
      clearTimeout(timer); clearTimeout(heartbeat); controller.signal.removeEventListener('abort', onAbort); controller.abort(); this.controller = null;
    }
    return true;
  }
  private async safeFail(lease: CloudLease, code: string): Promise<void> {
    try { await this.options.repository.fail(lease, code); } catch { /* A gateway outage leaves lease expiry as explicit INTERRUPTED recovery. */ }
  }
}
