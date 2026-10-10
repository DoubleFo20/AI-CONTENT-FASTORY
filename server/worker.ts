import { rm } from 'node:fs/promises';
import { validateIdeas, validateStoryPackage, type ErrorCode, type Job, type Project } from '../shared/contracts.js';
import type { AiProvider } from './ai/types.js';
import { AiProviderError } from './ai/provider.js';
import { AppError } from './errors.js';
import { assembleExport, managedPath } from './media.js';
import type { Store } from './store.js';
import { ProjectFiles } from './project-files.js';

export interface WorkerOptions {
  aiStatus?: () => { active: 'mock' | 'openai' | 'gemini' };
  prepareExport?: (ownerId: string, project: Project, signal: AbortSignal) => Promise<void>;
  jobTimeoutMs?: number;
  aiTimeoutMs?: number;
  exportTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  pollIntervalMs?: number;
}
export interface WorkerStatus {
  state: 'idle' | 'running' | 'stopped' | 'failed';
  activeJobId: string | null;
  lastErrorCode: ErrorCode | null;
}

export class Worker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<boolean> | null = null;
  private stopping = false;
  private started = false;
  private lastErrorCode: ErrorCode | null = null;
  private active: { job: Job; ownerId: string; controller: AbortController; cutOff: () => void } | null = null;
  private outstanding = new Map<string, { job: Job; ownerId: string }>();
  constructor(private store: Store, private provider: AiProvider, private options: WorkerOptions = {}) {
    for (const value of [options.jobTimeoutMs, options.aiTimeoutMs, options.exportTimeoutMs, options.shutdownTimeoutMs, options.pollIntervalMs]) {
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new AppError('INVALID_INPUT');
    }
  }

  status(ownerId: string): WorkerStatus {
    const outstanding = [...this.outstanding.values()].find(request => request.ownerId === ownerId);
    return { state: this.stopping ? 'stopped' : this.active || this.outstanding.size ? 'running' : this.lastErrorCode ? 'failed' : 'idle',
      activeJobId: this.active?.ownerId === ownerId ? this.active.job.id : outstanding?.job.id ?? null, lastErrorCode: this.lastErrorCode };
  }
  hasOutstanding(): boolean { return this.outstanding.size > 0; }
  assertAvailable(ownerId: string, projectId: string): void {
    if ([...this.outstanding.values()].some(request => request.ownerId === ownerId && request.job.projectId === projectId)) {
      throw new AppError('CONFLICT', 409);
    }
  }
  cancel(ownerId: string, jobId: string): Job {
    const job = this.store.cancel(ownerId, jobId);
    if (this.active?.job.id === jobId && this.active.ownerId === ownerId) {
      this.active.controller.abort(new AppError('JOB_CANCELLED', 409));
    }
    // Retain the serial slot until the provider settles or its original deadline expires.
    return job;
  }

  // startWorker:false keeps tests timer-free. runNext/drain never replay failures.
  runNext(): Promise<boolean> {
    if (this.stopping) return Promise.resolve(false);
    if (this.pending) return this.pending;
    this.pending = this.execute().catch(() => {
      this.lastErrorCode = 'WORKER_UNAVAILABLE';
      return false;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async drain(): Promise<void> { while (await this.runNext()) { /* bounded by queued jobs */ } }
  start() {
    if (this.started || this.stopping) return;
    this.started = true;
    const tick = async () => {
      await this.runNext();
      if (!this.stopping) this.timer = setTimeout(() => { void tick(); }, this.options.pollIntervalMs ?? 250);
    };
    void tick();
  }
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.active?.controller.abort(new AppError('INTERRUPTED', 409));
    const shutdownTimer = this.active ? setTimeout(this.active.cutOff, this.options.shutdownTimeoutMs ?? 5000) : null;
    try { await this.pending; }
    finally { if (shutdownTimer) clearTimeout(shutdownTimer); }
  }
  private async execute(): Promise<boolean> {
    // Claim errors are caught by runNext so the polling loop always survives.
    const claimed = this.store.claim([...this.outstanding.values()].map(request => request.job.projectId));
    if (!claimed) return false;
    const { job, ownerId } = claimed;
    const controller = new AbortController();
    let cutOff!: () => void;
    const cutoff = new Promise<never>((_resolve, reject) => {
      cutOff = () => reject(controller.signal.reason instanceof AppError ? controller.signal.reason : new AppError('INTERRUPTED', 409));
    });
    this.active = { job, ownerId, controller, cutOff };
    this.lastErrorCode = null;
    const timeoutMs = this.options.jobTimeoutMs ?? (job.type === 'export' ? this.options.exportTimeoutMs ?? 3_000_000 : this.options.aiTimeoutMs ?? 240_000);
    const deadline = setTimeout(() => {
      if (!controller.signal.aborted) controller.abort(new AppError('JOB_TIMEOUT', 408));
      cutOff();
    }, timeoutMs);
    this.outstanding.set(job.id, { job, ownerId });
    const operation = this.perform(job, ownerId, controller.signal).finally(() => { this.outstanding.delete(job.id); });
    try {
      // A deadline bounds the worker wait, but an ignoring provider remains a project blocker.
      await Promise.race([operation, cutoff]);
    } catch (error) {
      const failure = controller.signal.aborted ? controller.signal.reason : error;
      const code = failure instanceof AppError || failure instanceof AiProviderError ? failure.code : 'AI_REQUEST_FAILED';
      this.lastErrorCode = code;
      this.store.failJob(job.id, code);
    } finally {
      clearTimeout(deadline);
      this.active = null;
    }
    return true;
  }
  private async perform(job: Job, ownerId: string, signal: AbortSignal): Promise<void> {
    let stage: 'provider' | 'validation' | 'media' = 'provider';
    let exportedFile: string | null = null;
    try {
      const project = this.store.project(ownerId, job.projectId);
      this.store.prerequisites(project, job.type);
      const input = { name: project.name, brief: project.brief, genre: project.genre, audience: project.audience, aspectRatio: project.aspectRatio, ...(project.targetDurationSeconds !== undefined ? { targetDurationSeconds: project.targetDurationSeconds } : {}) };
      this.store.updateProgress(job.id, 15);
      const requestOptions = { signal, onUsage: (usage: import('../shared/ai.js').AiUsage) => {
        if (!signal.aborted) this.store.recordAiUsage(ownerId, job, usage);
      } };
      if (job.type === 'ideas') {
        const ideas = await this.provider.generateIdeas(input, requestOptions);
        signal.throwIfAborted();
        stage = 'validation'; this.store.updateProgress(job.id, 70);
        const valid = validateIdeas(ideas);
        this.store.updateProgress(job.id, 90);
        this.store.completeIdeas(job, valid, this.options.aiStatus?.().active);
      } else if (job.type === 'expand') {
        const selected = project.ideas.find(idea => idea.id === project.selectedIdeaId);
        if (!selected) throw new AppError('SELECTION_REQUIRED', 409);
        const story = await this.provider.expandStory(input, selected, requestOptions);
        signal.throwIfAborted();
        stage = 'validation'; this.store.updateProgress(job.id, 70);
        const valid = validateStoryPackage(story);
        this.store.updateProgress(job.id, 90);
        this.store.completePackage(job, valid, this.options.aiStatus?.().active);
      } else {
        stage = 'media';
        await this.options.prepareExport?.(ownerId, project, signal);
        signal.throwIfAborted();
        const options = new ProjectFiles(this.store.dataDir).exportOptions(project, ownerId);
        exportedFile = await assembleExport(this.store, ownerId, project, signal, { ...options, onProgress: fraction => this.store.updateProgress(job.id, 20 + Math.floor(fraction * 60)) });
        signal.throwIfAborted();
        this.store.updateProgress(job.id, 90);
        if (this.store.completeExport(job, exportedFile, project.aspectRatio)) exportedFile = null;
      }
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (error instanceof AppError || error instanceof AiProviderError) throw error;
      throw new AppError(stage === 'validation' ? 'AI_INVALID_OUTPUT' : stage === 'media' ? 'EXPORT_FAILED' : 'AI_REQUEST_FAILED', 500);
    } finally {
      if (exportedFile) await rm(managedPath(this.store.dataDir, 'exports', exportedFile), { force: true });
    }
  }
}
