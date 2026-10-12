import type { Idea, ProjectInput, StoryPackage } from '../../shared/contracts.js';
import type { AiUsage } from '../../shared/ai.js';

export interface AiRequestOptions { signal?: AbortSignal; onUsage?: (usage: AiUsage) => void }

export interface AiProvider {
  generateIdeas(input: ProjectInput, options?: AiRequestOptions): Promise<Idea[]>;
  expandStory(input: ProjectInput, selectedIdea: Idea, options?: AiRequestOptions): Promise<StoryPackage>;
}
