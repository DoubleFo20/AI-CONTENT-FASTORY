import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { ERROR_CODES, IdeasResultSchema, validateIdeas, validateStoryPackage, type ErrorCode } from '../../shared/contracts.js';
import { CloudJobInputSchema, CloudProjectSnapshotSchema, CloudLeaseSchema, type CloudJob, type CloudJobInput, type CloudLease, type CloudProjectSnapshot, type CloudRepository } from '../../shared/integrations.js';
import { AppError } from '../errors.js';

export function assertIdentifier(value: string): void {
  if (!z.uuid().safeParse(value).success) throw new AppError('INVALID_INPUT');
}
export function parseSnapshot(input: unknown, ownerId: string): CloudProjectSnapshot {
  assertIdentifier(ownerId);
  try {
    const snapshot = CloudProjectSnapshotSchema.parse(input);
    if (snapshot.ownerId !== ownerId || snapshot.revision > 2147483647) throw new Error('invalid');
    if (snapshot.ideas.length) validateIdeas(snapshot.ideas);
    if (snapshot.package) validateStoryPackage(snapshot.package);
    return snapshot;
  } catch { throw new AppError('INVALID_INPUT'); }
}
export function parseJobInput(input: unknown): CloudJobInput {
  const parsed = CloudJobInputSchema.safeParse(input);
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  if (parsed.data.type === 'export' && new Set(parsed.data.sceneIds).size !== parsed.data.sceneIds.length) throw new AppError('INVALID_INPUT');
  return parsed.data;
}
export function parseResult(type: CloudJob['type'], input: unknown): unknown {
  try {
    if (type === 'ideas') return { ideas: validateIdeas(IdeasResultSchema.parse(Array.isArray(input) ? { ideas: input } : input).ideas) };
    if (type === 'expand') return validateStoryPackage(input);
    return z.strictObject({ exportId: z.uuid() }).parse(input);
  } catch { throw new AppError(type === 'export' ? 'EXPORT_FAILED' : 'AI_INVALID_OUTPUT'); }
}
export function safeFailure(code: string): ErrorCode { return ERROR_CODES.find(item => item === code) ?? 'INTERNAL_ERROR'; }

interface Entry { job: CloudJob; input: CloudJobInput; revision: number; lease: CloudLease | null; result: unknown }
interface MemoryOptions { now?: () => number; leaseMs?: number }

/** Atomic operations are synchronous until their returned Promise; no data escapes by reference. */
export class MemoryCloudRepository implements CloudRepository {
  private readonly snapshots = new Map<string, CloudProjectSnapshot>();
  private readonly entries = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly leaseMs: number;
  constructor(options: MemoryOptions = {}) {
    this.now = options.now ?? Date.now; this.leaseMs = options.leaseMs ?? 30000;
    if (!Number.isInteger(this.leaseMs) || this.leaseMs < 1000 || this.leaseMs > 120000) throw new AppError('INVALID_INPUT');
  }
  private expire(): void {
    const now = this.now();
    for (const entry of this.entries.values()) {
      if (entry.job.status === 'running' && entry.lease && Date.parse(entry.lease.expiresAt) <= now) {
        entry.job.status = 'failed'; entry.job.errorCode = 'INTERRUPTED'; entry.job.updatedAt = new Date(now).toISOString(); entry.lease = null;
      }
    }
  }
  private active(id: string): boolean { return [...this.entries.values()].some(entry => entry.job.projectId === id && ['queued', 'running'].includes(entry.job.status)); }
  async projects(ownerId: string): Promise<CloudProjectSnapshot[]> {
    assertIdentifier(ownerId); this.expire();
    return structuredClone([...this.snapshots.values()].reverse().filter(snapshot => snapshot.ownerId === ownerId).slice(0,100));
  }
  async saveProject(ownerId: string, input: CloudProjectSnapshot): Promise<void> {
    const snapshot = parseSnapshot(input, ownerId); this.expire();
    const prior = this.snapshots.get(snapshot.id);
    if (prior?.ownerId !== ownerId && prior) throw new AppError('NOT_FOUND', 404);
    if (prior && isDeepStrictEqual(prior, snapshot)) return;
    if (this.active(snapshot.id)) throw new AppError('CONFLICT', 409);
    if (snapshot.revision !== (prior ? prior.revision + 1 : 1)) throw new AppError('CONFLICT', 409);
    if (prior?.ideas.length && !isDeepStrictEqual(prior.ideas, snapshot.ideas)) throw new AppError('CONFLICT', 409);
    if (prior?.package && (!isDeepStrictEqual(prior.package, snapshot.package) || prior.selectedIdeaId !== snapshot.selectedIdeaId || !isDeepStrictEqual(prior.brief, snapshot.brief))) throw new AppError('CONFLICT', 409);
    this.snapshots.set(snapshot.id, structuredClone(snapshot));
  }
  async project(ownerId: string, projectId: string): Promise<CloudProjectSnapshot | null> {
    assertIdentifier(ownerId); assertIdentifier(projectId); this.expire();
    const project = this.snapshots.get(projectId);
    return project?.ownerId === ownerId ? structuredClone(project) : null;
  }
  async enqueue(ownerId: string, projectId: string, input: CloudJobInput): Promise<CloudJob> {
    assertIdentifier(ownerId); assertIdentifier(projectId); const parsed = parseJobInput(input); this.expire();
    const project = this.snapshots.get(projectId);
    if (!project || project.ownerId !== ownerId) throw new AppError('NOT_FOUND', 404);
    if (project.revision >= 2147483647) throw new AppError('CONFLICT',409);
    if (this.active(projectId)) throw new AppError('CONFLICT', 409);
    if (parsed.type !== 'export' && !isDeepStrictEqual(project.brief, parsed.brief)) throw new AppError('CONFLICT', 409);
    if (parsed.type === 'ideas' && (project.ideas.length || project.selectedIdeaId || project.package)) throw new AppError('CONFLICT', 409);
    if (parsed.type === 'expand') {
      const selected = project.ideas.find(idea => idea.id === project.selectedIdeaId);
      if (!selected) throw new AppError('SELECTION_REQUIRED', 409);
      if (project.package || !isDeepStrictEqual(selected, parsed.selectedIdea)) throw new AppError('CONFLICT', 409);
    }
    if (parsed.type === 'export') {
      if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
      if (project.brief.aspectRatio !== parsed.aspectRatio || !isDeepStrictEqual(project.package.scenes.map(scene => scene.id), parsed.sceneIds)) throw new AppError('CONFLICT', 409);
    }
    const timestamp = new Date(this.now()).toISOString();
    const job: CloudJob = { id: randomUUID(), ownerId, projectId, type: parsed.type, target: parsed.type === 'export' ? 'local' : 'cloud', status: 'queued', progress: 0, errorCode: null, createdAt: timestamp, updatedAt: timestamp };
    this.entries.set(job.id, { job, input: structuredClone(parsed), revision: project.revision, lease: null, result: null });
    return structuredClone(job);
  }
  async jobs(ownerId: string, projectId: string): Promise<CloudJob[]> {
    assertIdentifier(ownerId); assertIdentifier(projectId); this.expire();
    return structuredClone([...this.entries.values()].filter(entry => entry.job.ownerId === ownerId && entry.job.projectId === projectId).slice(0,1000).map(entry => entry.job));
  }
  async claim(workerId: string, target: 'cloud' | 'local'): Promise<CloudLease | null> {
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(workerId) || !['cloud', 'local'].includes(target)) throw new AppError('INVALID_INPUT');
    this.expire();
    const entry = [...this.entries.values()].find(item => item.job.status === 'queued' && item.job.target === target);
    if (!entry) return null;
    entry.job.status = 'running'; entry.job.updatedAt = new Date(this.now()).toISOString();
    entry.lease = { job: structuredClone(entry.job), input: structuredClone(entry.input), workerId, token: randomUUID(), expiresAt: new Date(this.now() + this.leaseMs).toISOString() };
    return structuredClone(entry.lease);
  }
  private leased(lease: CloudLease): Entry | undefined {
    this.expire();
    if (!CloudLeaseSchema.safeParse(lease).success) return undefined;
    const entry = this.entries.get(lease.job.id);
    return entry?.lease && entry.job.status === 'running' && entry.lease.token === lease.token && entry.lease.workerId === lease.workerId && entry.job.ownerId === lease.job.ownerId && entry.job.projectId === lease.job.projectId && entry.job.type === lease.job.type && entry.job.target === lease.job.target && isDeepStrictEqual(entry.input, lease.input) && this.snapshots.get(entry.job.projectId)?.revision === entry.revision ? entry : undefined;
  }
  async heartbeat(lease: CloudLease, progress: number): Promise<boolean> {
    if (!Number.isInteger(progress) || progress < 0 || progress > 99) throw new AppError('INVALID_INPUT');
    const entry = this.leased(lease); if (!entry?.lease) return false;
    entry.job.progress = Math.max(entry.job.progress, progress); entry.job.updatedAt = new Date(this.now()).toISOString();
    entry.lease.expiresAt = new Date(this.now() + this.leaseMs).toISOString(); return true;
  }
  async complete(lease: CloudLease, result: unknown): Promise<boolean> {
    const entry = this.leased(lease); if (!entry) return false;
    const valid = parseResult(entry.job.type, result);
    const project = this.snapshots.get(entry.job.projectId);
    if (!project || project.revision !== entry.revision) throw new AppError('CONFLICT', 409);
    if (entry.job.type === 'ideas') project.ideas = (valid as { ideas: CloudProjectSnapshot['ideas'] }).ideas;
    if (entry.job.type === 'expand') {
      if (entry.input.type !== 'expand' || project.selectedIdeaId !== entry.input.selectedIdea.id) throw new AppError('CONFLICT', 409);
      project.package = valid as CloudProjectSnapshot['package'];
    }
    project.revision += 1; entry.result = structuredClone(valid); entry.job.status = 'completed'; entry.job.progress = 100;
    entry.job.updatedAt = new Date(this.now()).toISOString(); entry.lease = null; return true;
  }
  async fail(lease: CloudLease, errorCode: string): Promise<boolean> {
    const entry = this.leased(lease); if (!entry) return false;
    entry.job.status = 'failed'; entry.job.errorCode = safeFailure(errorCode); entry.job.updatedAt = new Date(this.now()).toISOString(); entry.lease = null; return true;
  }
}
