import type { Idea, ProjectInput, StoryPackage } from '../../shared/contracts.js';

export interface AiRequestOptions { signal?: AbortSignal }

export interface AiProvider {
  generateIdeas(input: ProjectInput, options?: AiRequestOptions): Promise<Idea[]>;
  expandStory(input: ProjectInput, selectedIdea: Idea, options?: AiRequestOptions): Promise<StoryPackage>;
}
