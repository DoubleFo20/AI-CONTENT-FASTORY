import { randomUUID } from 'node:crypto';
import { validateIdeas, validateStoryPackage } from '../../shared/contracts.js';
import type { CloudRepository } from '../../shared/integrations.js';
import type { AiProvider } from '../ai/types.js';
import { AppError } from '../errors.js';
import { CloudRunner } from './runner.js';

/** Cloud AI executor only. Local editing requires a separately paired worker. */
export class CloudAiWorker {
  private readonly runner: CloudRunner;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private stopping = false;
  constructor(repository: CloudRepository, provider: AiProvider) {
    this.runner = new CloudRunner({
      repository, workerId: `cloud-${randomUUID()}`, target: 'cloud',
      execute: async (input, signal) => {
        if (signal.aborted) throw new AppError('INTERRUPTED', 409);
        if (input.type === 'ideas') return { ideas: validateIdeas(await provider.generateIdeas(input.brief)) };
        if (input.type === 'expand') return validateStoryPackage(await provider.expandStory(input.brief, input.selectedIdea));
        throw new AppError('CONFLICT', 409);
      },
    });
  }
  runNext(): Promise<boolean> { return this.runner.runNext(); }
  start(): void {
    if (this.started || this.stopping) return;
    this.started = true;
    const tick = async () => {
      try { await this.runner.runNext(); } catch { /* No replay; an unavailable gateway is polled without exposing its details. */ }
      if (!this.stopping) this.timer = setTimeout(() => { void tick(); }, 2000);
    };
    void tick();
  }
  async stop(): Promise<void> {
    this.stopping = true;
    clearTimeout(this.timer);
    await this.runner.stop();
  }
}
