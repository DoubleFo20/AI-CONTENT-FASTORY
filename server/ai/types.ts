import type { Idea, ProjectInput, StoryPackage } from '../../shared/contracts.js';

export interface AiProvider {
  generateIdeas(input: ProjectInput): Promise<Idea[]>;
  expandStory(input: ProjectInput, selectedIdea: Idea): Promise<StoryPackage>;
}
