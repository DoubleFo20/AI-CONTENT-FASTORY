import { z } from 'zod';
import type { AiUsageReceipt } from './ai.js';

export const LocalizedTextSchema = z.strictObject({ th: z.string().min(1).max(8000), en: z.string().min(1).max(8000) });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;
export type Locale = 'th' | 'en';
export const AspectRatioSchema = z.enum(['9:16', '16:9', '1:1']);
export const ProjectInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  brief: z.string().trim().min(10).max(4000),
  genre: z.string().trim().min(1).max(100),
  audience: z.string().trim().min(1).max(120),
  aspectRatio: AspectRatioSchema,
  targetDurationSeconds: z.number().int().min(12).max(180).optional(),
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;
export const AuthInputSchema = z.strictObject({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(12).max(128),
});
export const IdeaSchema = z.strictObject({
  id: z.string().min(1).max(64), title: LocalizedTextSchema,
  logline: LocalizedTextSchema, hook: LocalizedTextSchema,
});
export const IdeasResultSchema = z.strictObject({ ideas: z.array(IdeaSchema).length(10) });
export type Idea = z.infer<typeof IdeaSchema>;
export const CharacterSchema = z.strictObject({
  id: z.string().min(1).max(64), name: z.string().min(1).max(120),
  visualDescriptionEn: z.string().min(1).max(2000), background: LocalizedTextSchema,
});
export const LocationSchema = z.strictObject({
  id: z.string().min(1).max(64), name: LocalizedTextSchema,
  visualDescriptionEn: z.string().min(1).max(2000), description: LocalizedTextSchema,
});
export const SceneSchema = z.strictObject({
  id: z.string().min(1).max(64), order: z.number().int().min(1).max(12),
  title: LocalizedTextSchema, durationSeconds: z.number().int().min(4).max(20),
  explanationTh: z.string().min(1).max(4000), flowPromptEn: z.string().min(1).max(4000),
  narration: LocalizedTextSchema, characterIds: z.array(z.string().min(1).max(64)).min(1).max(6),
  locationId: z.string().min(1).max(64),
});
export const StoryPackageSchema = z.strictObject({
  storyBible: LocalizedTextSchema,
  characters: z.array(CharacterSchema).min(1).max(6),
  locations: z.array(LocationSchema).min(1).max(6),
  continuityRules: z.array(LocalizedTextSchema).min(1).max(12),
  scenes: z.array(SceneSchema).min(3).max(12),
});
export type StoryPackage = z.infer<typeof StoryPackageSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type ProductionStatus = 'draft' | 'ideas_ready' | 'selected' | 'expanded' | 'clips_ready' | 'exported';
export type JobType = 'ideas' | 'expand' | 'export';
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed';
export interface User { id: string; username: string }
export interface AuthState { user: User | null; csrfToken: string | null; setupRequired: boolean }
export interface Clip {
  id: string; projectId: string; sceneId: string; originalName: string;
  durationSeconds: number; createdAt: string;
}
export interface ExportArtifact { id: string; projectId: string; aspectRatio: z.infer<typeof AspectRatioSchema>; createdAt: string }
export interface ProjectSummary extends ProjectInput {
  id: string; status: ProductionStatus; createdAt: string; updatedAt: string;
  generation?: { ideas?: 'mock' | 'openai' | 'gemini'; expansion?: 'mock' | 'openai' | 'gemini' };
  aiUsage?: AiUsageReceipt[];
}
export interface Project extends ProjectSummary {
  ideas: Idea[]; selectedIdeaId: string | null; package: StoryPackage | null;
  clips: Clip[]; export: ExportArtifact | null;
}
export interface Job {
  id: string; projectId: string; projectName: string; type: JobType; status: JobStatus;
  progress: number; errorCode: string | null; createdAt: string; updatedAt: string;
}
export interface Dashboard {
  projectsCount: number; completedCount: number; activeJobsCount: number;
  recentProjects: ProjectSummary[];
}
export const ERROR_CODES = [
  'AUTH_REQUIRED', 'INVALID_CREDENTIALS', 'ALREADY_CONFIGURED', 'SETUP_LOCAL_ONLY',
  'INVALID_INPUT', 'CSRF_INVALID', 'ORIGIN_FORBIDDEN', 'RATE_LIMITED', 'NOT_FOUND',
  'CONFLICT', 'SELECTION_REQUIRED', 'IDEAS_REQUIRED', 'INVALID_SELECTION',
  'PACKAGE_REQUIRED', 'CLIPS_REQUIRED', 'INVALID_MEDIA', 'FILE_TOO_LARGE',
  'AI_NOT_CONFIGURED', 'AI_REQUEST_FAILED', 'AI_INVALID_OUTPUT', 'AI_REFUSED',
  'AI_TIMEOUT', 'AI_QUOTA_EXCEEDED', 'AI_RATE_LIMITED', 'AI_ACCESS_DENIED', 'AI_MODE_LOCKED', 'AI_PROVIDER_NOT_APPROVED',
  'DRIVE_NOT_CONFIGURED', 'DRIVE_NOT_CONNECTED', 'DRIVE_AUTH_FAILED', 'DRIVE_ACCESS_DENIED',
  'DRIVE_REQUEST_FAILED', 'DRIVE_TIMEOUT', 'DRIVE_INVALID_OUTPUT', 'DRIVE_VAULT_FAILED',
  'MEDIA_TOOL_MISSING', 'EXPORT_FAILED', 'INTERRUPTED', 'JOB_CANCELLED', 'JOB_TIMEOUT', 'WORKER_UNAVAILABLE', 'INTERNAL_ERROR',
] as const;
export type ErrorCode = typeof ERROR_CODES[number];
export interface ApiErrorBody { error: { code: ErrorCode } }

export function validateIdeas(ideas: Idea[]): Idea[] {
  const result = IdeasResultSchema.parse({ ideas }).ideas;
  if (new Set(result.map((idea) => idea.id)).size !== 10) throw new Error('AI_INVALID_OUTPUT');
  return result;
}

export function validateStoryPackage(input: unknown): StoryPackage {
  const result = StoryPackageSchema.parse(input);
  const characters = new Set(result.characters.map((character) => character.id));
  const locations = new Set(result.locations.map((location) => location.id));
  const scenes = new Set(result.scenes.map((scene) => scene.id));
  if (characters.size !== result.characters.length || locations.size !== result.locations.length ||
      scenes.size !== result.scenes.length || result.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) > 180) {
    throw new Error('AI_INVALID_OUTPUT');
  }
  for (const [index, scene] of result.scenes.entries()) {
    if (scene.order !== index + 1 || !locations.has(scene.locationId) ||
        scene.characterIds.some((id) => !characters.has(id))) throw new Error('AI_INVALID_OUTPUT');
  }
  return result;
}
