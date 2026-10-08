import { z } from 'zod';
import { CloudJobSchema, CloudLeaseSchema, type CloudJob, type CloudJobInput, type CloudLease, type CloudProjectSnapshot, type CloudRepository } from '../../shared/integrations.js';
import { AppError } from '../errors.js';
import { assertIdentifier, parseJobInput, parseResult, parseSnapshot, safeFailure } from './memory.js';

export interface SupabaseOptions { url: string; secretKey?: string; serviceRoleKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
const maxBodyBytes = 8 * 1024 * 1024;

export class SupabaseCloudRepository implements CloudRepository {
  private readonly url: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  constructor(options: SupabaseOptions) {
    let url: URL;
    try { url = new URL(options.url); } catch { throw new AppError('INVALID_INPUT'); }
    if (url.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new AppError('INVALID_INPUT');
    const key = options.secretKey ?? options.serviceRoleKey;
    if (!key || /\s/.test(key) || key.length > 4096) throw new AppError('INVALID_INPUT');
    if (!/^sb_secret_[a-zA-Z0-9_-]{20,}$/.test(key)) {
      try {
        if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key) || (JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) as { role?: unknown }).role !== 'service_role') throw new Error('invalid');
      } catch { throw new AppError('INVALID_INPUT'); }
    }
    this.url = url.origin; this.key = key; this.fetchImpl = options.fetchImpl ?? fetch; this.timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 60000) throw new AppError('INVALID_INPUT');
  }
  private async call(path: string, payload?: unknown): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new AppError('INTERRUPTED', 504)); }, this.timeoutMs); });
    const operation = async () => {
      const requestUrl = `${this.url}/rest/v1/${path}`;
      const result = await this.fetchImpl(requestUrl, {
        method: payload === undefined ? 'GET' : 'POST', signal: controller.signal, redirect: 'error',
        headers: { apikey: this.key, ...(!this.key.startsWith('sb_secret_') ? { Authorization: `Bearer ${this.key}` } : {}), 'Content-Type': 'application/json', 'Accept-Profile': 'factory_cloud', 'Content-Profile': 'factory_cloud' },
        ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      });
      if (result.redirected || result.url && new URL(result.url).href !== new URL(requestUrl).href) { void result.body?.cancel().catch(() => {}); throw new AppError('INTERNAL_ERROR',502); }
      const responsePayload = await this.readJson(result,controller.signal);
      if (!result.ok) {
        // Only our closed SQL message catalog can influence a safe application error.
        const error: unknown = responsePayload;
        const code = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : '';
        const safe = ['CONFLICT', 'NOT_FOUND', 'INVALID_INPUT', 'SELECTION_REQUIRED', 'PACKAGE_REQUIRED', 'AI_INVALID_OUTPUT', 'EXPORT_FAILED'].includes(code) ? safeFailure(code) : 'INTERNAL_ERROR';
        throw new AppError(safe, safe === 'INTERNAL_ERROR' ? 502 : 409);
      }
      return responsePayload;
    };
    try { return await Promise.race([operation(), timeout]); }
    catch (error) { if (error instanceof AppError) throw error; throw new AppError('INTERNAL_ERROR', 502); }
    finally { clearTimeout(timer!); }
  }
  private async readJson(response: Response, signal: AbortSignal): Promise<unknown> {
    if (!response.body) throw new AppError('INTERNAL_ERROR',502);
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort',cancel,{once:true});
    if(signal.aborted) cancel();
    try {
      let bytes = 0; const chunks: Uint8Array[] = [];
      for (;;) {
        const chunk = await reader.read(); if(chunk.done) break;
        bytes += chunk.value.byteLength;
        if(bytes>maxBodyBytes) { cancel(); throw new AppError('INTERNAL_ERROR',502); }
        chunks.push(chunk.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    } finally { signal.removeEventListener('abort',cancel); reader.releaseLock(); }
  }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value); if (!result.success) throw new AppError('INTERNAL_ERROR', 502); return result.data;
  }
  async saveProject(ownerId: string, project: CloudProjectSnapshot): Promise<void> {
    const snapshot = parseSnapshot(project, ownerId);
    const result = await this.call('rpc/save_project', { p_owner: ownerId, p_snapshot: snapshot });
    if (result !== true) throw new AppError('INTERNAL_ERROR', 502);
  }
  async projects(ownerId: string): Promise<CloudProjectSnapshot[]> {
    assertIdentifier(ownerId);
    const rows = this.parse(z.array(z.unknown()).max(100), await this.call('rpc/list_projects', { p_owner: ownerId }));
    try { return rows.map(row => parseSnapshot(row,ownerId)); } catch { throw new AppError('INTERNAL_ERROR',502); }
  }
  async project(ownerId: string, projectId: string): Promise<CloudProjectSnapshot | null> {
    assertIdentifier(ownerId); assertIdentifier(projectId);
    const rows = this.parse(z.array(z.strictObject({ snapshot: z.unknown() })).max(1), await this.call(`projects?select=snapshot&owner_id=eq.${ownerId}&id=eq.${projectId}&limit=1`));
    if (!rows.length) return null;
    try {
      const snapshot = parseSnapshot(rows[0].snapshot, ownerId);
      if (snapshot.id !== projectId) throw new Error('invalid'); return snapshot;
    } catch { throw new AppError('INTERNAL_ERROR', 502); }
  }
  async enqueue(ownerId: string, projectId: string, input: CloudJobInput): Promise<CloudJob> {
    assertIdentifier(ownerId); assertIdentifier(projectId);
    const parsed = parseJobInput(input);
    const job = this.parse(CloudJobSchema, await this.call('rpc/enqueue_job', { p_owner: ownerId, p_project: projectId, p_input: parsed }));
    if (job.ownerId !== ownerId || job.projectId !== projectId || job.type !== parsed.type) throw new AppError('INTERNAL_ERROR', 502);
    return job;
  }
  async jobs(ownerId: string, projectId: string): Promise<CloudJob[]> {
    assertIdentifier(ownerId); assertIdentifier(projectId);
    const rows = this.parse(z.array(CloudJobSchema).max(1000), await this.call('rpc/list_jobs',{p_owner:ownerId,p_project:projectId}));
    return rows.map(job => {
      if (job.ownerId !== ownerId || job.projectId !== projectId) throw new AppError('INTERNAL_ERROR', 502); return job;
    });
  }
  async claim(workerId: string, target: 'cloud' | 'local'): Promise<CloudLease | null> {
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(workerId) || !['cloud', 'local'].includes(target)) throw new AppError('INVALID_INPUT');
    const value = await this.call('rpc/claim_job', { p_worker: workerId, p_target: target });
    if (value === null) return null;
    const lease = this.parse(CloudLeaseSchema, value);
    if (lease.workerId !== workerId || lease.job.target !== target) throw new AppError('INTERNAL_ERROR', 502); return lease;
  }
  private leasePayload(lease: CloudLease): Record<string, unknown> {
    const valid = CloudLeaseSchema.safeParse(lease); if (!valid.success) throw new AppError('INVALID_INPUT');
    return { p_job: lease.job.id, p_owner: lease.job.ownerId, p_project: lease.job.projectId, p_worker: lease.workerId, p_token: lease.token, p_type:lease.job.type, p_target:lease.job.target, p_input:lease.input };
  }
  async heartbeat(lease: CloudLease, progress: number): Promise<boolean> {
    if (!Number.isInteger(progress) || progress < 0 || progress > 99) throw new AppError('INVALID_INPUT');
    return this.parse(z.boolean(), await this.call('rpc/heartbeat_job', { ...this.leasePayload(lease), p_progress: progress }));
  }
  async complete(lease: CloudLease, result: unknown): Promise<boolean> {
    const payload = this.leasePayload(lease);
    return this.parse(z.boolean(), await this.call('rpc/complete_job', { ...payload, p_result: parseResult(lease.job.type, result) }));
  }
  async fail(lease: CloudLease, errorCode: string): Promise<boolean> {
    return this.parse(z.boolean(), await this.call('rpc/fail_job', { ...this.leasePayload(lease), p_error: safeFailure(errorCode) }));
  }
}

/** Missing configuration keeps cloud opt-in; malformed supplied configuration fails closed. */
export function createSupabaseRepository(options: Partial<SupabaseOptions> = {}): SupabaseCloudRepository | null {
  if (!options.url || !(options.secretKey ?? options.serviceRoleKey)) return null;
  return new SupabaseCloudRepository({ ...options, url: options.url });
}
