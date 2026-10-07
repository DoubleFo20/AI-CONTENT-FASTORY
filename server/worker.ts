import { rm } from 'node:fs/promises';
import { validateIdeas, validateStoryPackage } from '../shared/contracts.js';
import type { AiProvider } from './ai/types.js';
import { AiProviderError } from './ai/provider.js';
import { AppError } from './errors.js';
import { assembleExport, managedPath } from './media.js';
import type { Store } from './store.js';

export class Worker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<boolean> | null = null;
  private stopping = false;
  private abort = new AbortController();
  constructor(private store: Store, private provider: AiProvider) {}

  // startWorker:false keeps tests timer-free. runNext/drain never poll or replay failures.
  runNext(): Promise<boolean> {
    if (this.stopping) return Promise.resolve(false);
    if (this.pending) return this.pending;
    this.pending = this.execute().finally(() => { this.pending = null; });
    return this.pending;
  }
  async drain(): Promise<void> { while (await this.runNext()) { /* bounded by queued jobs */ } }
  start() {
    const tick = async () => {
      await this.runNext();
      if (!this.stopping) this.timer = setTimeout(() => { void tick(); }, 250);
    };
    void tick();
  }
  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.abort.abort();
    await this.pending;
  }
  private async execute(): Promise<boolean> {
    const claimed = this.store.claim();
    if (!claimed) return false;
    const { job, ownerId } = claimed;
    let stage: 'provider' | 'validation' | 'media' = 'provider';
    let exportedFile: string | null = null;
    try {
      const project = this.store.project(ownerId, job.projectId);
      this.store.prerequisites(project, job.type);
      const input = { name: project.name, brief: project.brief, genre: project.genre, audience: project.audience, aspectRatio: project.aspectRatio };
      if (job.type === 'ideas') {
        const ideas = await this.provider.generateIdeas(input);
        stage = 'validation'; const valid = validateIdeas(ideas);
        if (this.stopping) throw new AppError('INTERRUPTED', 409);
        this.store.completeIdeas(job, valid);
      } else if (job.type === 'expand') {
        const selected = project.ideas.find(idea => idea.id === project.selectedIdeaId);
        if (!selected) throw new AppError('SELECTION_REQUIRED', 409);
        const story = await this.provider.expandStory(input, selected);
        stage = 'validation'; const valid = validateStoryPackage(story);
        if (this.stopping) throw new AppError('INTERRUPTED', 409);
        this.store.completePackage(job, valid);
      } else {
        stage = 'media';
        exportedFile = await assembleExport(this.store, ownerId, project, this.abort.signal);
        if (this.stopping) throw new AppError('INTERRUPTED', 409);
        this.store.completeExport(job, exportedFile, project.aspectRatio);
        exportedFile = null;
      }
    } catch (error) {
      if (exportedFile) await rm(managedPath(this.store.dataDir, 'exports', exportedFile), { force: true });
      const code = error instanceof AppError || error instanceof AiProviderError ? error.code :
        stage === 'validation' ? 'AI_INVALID_OUTPUT' : stage === 'media' ? 'EXPORT_FAILED' : 'AI_REQUEST_FAILED';
      this.store.failJob(job.id, code);
    }
    return true;
  }
}
