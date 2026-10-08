import { z } from 'zod';
import { ProjectInputSchema, IdeaSchema, StoryPackageSchema, ERROR_CODES, validateIdeas, validateStoryPackage } from './contracts.js';

export const AiModeSchema = z.enum(['openai', 'mock', 'auto']);
export type AiMode = z.infer<typeof AiModeSchema>;
export interface AiRuntimeStatus { mode: AiMode; active: 'openai' | 'mock'; fallbackReason: 'not_configured' | 'quota' | 'access' | null }
export interface DriveStatus { provider: 'google_drive'; configured: boolean; connected: boolean; state: 'not_configured' | 'disconnected' | 'connected' | 'failed' }
export interface RuntimeCapabilities {
  ai: AiRuntimeStatus; video: { primary: 'google_flow'; integration: 'manual'; supporting: 'meta_ai'; supportingAvailable: false };
  storage: DriveStatus; structuredData: { active: 'sqlite'; cloudTarget: 'supabase_postgres'; configured: boolean };
  execution: { active: 'local'; cloudDeploymentVerified: false; localEditing: 'ffmpeg'; remotionAvailable: false };
}
export const CloudProjectSnapshotSchema = z.strictObject({
  id: z.uuid(), ownerId: z.uuid(), brief: ProjectInputSchema,
  ideas: z.array(IdeaSchema).max(10), selectedIdeaId: z.string().min(1).max(64).nullable(),
  package: StoryPackageSchema.nullable(), revision: z.number().int().min(1),
}).superRefine((value, context) => {
  if (value.ideas.length) {
    try { validateIdeas(value.ideas); }
    catch { context.addIssue({ code: 'custom', message: 'Invalid ideas' }); }
  }
  if (value.selectedIdeaId && !value.ideas.some(idea => idea.id === value.selectedIdeaId)) context.addIssue({ code: 'custom', message: 'Invalid selection' });
  if (value.package && !value.selectedIdeaId) context.addIssue({ code: 'custom', message: 'Selection required' });
  if (value.package) {
    try { validateStoryPackage(value.package); }
    catch { context.addIssue({ code: 'custom', message: 'Invalid story package' }); }
  }
});
export type CloudProjectSnapshot = z.infer<typeof CloudProjectSnapshotSchema>;
export const CloudJobInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ideas'), brief: ProjectInputSchema }),
  z.strictObject({ type: z.literal('expand'), brief: ProjectInputSchema, selectedIdea: IdeaSchema }),
  z.strictObject({ type: z.literal('export'), aspectRatio: z.enum(['9:16', '16:9', '1:1']), sceneIds: z.array(z.string().min(1).max(64)).min(3).max(12).refine(ids => new Set(ids).size === ids.length) }),
]);
export type CloudJobInput = z.infer<typeof CloudJobInputSchema>;
export const CloudJobSchema = z.strictObject({
  id: z.uuid(), ownerId: z.uuid(), projectId: z.uuid(), type: z.enum(['ideas', 'expand', 'export']),
  target: z.enum(['cloud', 'local']), status: z.enum(['queued', 'running', 'completed', 'failed']), progress: z.number().int().min(0).max(100),
  errorCode: z.enum(ERROR_CODES).nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
}).refine(job => job.target === (job.type === 'export' ? 'local' : 'cloud'));
export type CloudJob = z.infer<typeof CloudJobSchema>;
export const CloudLeaseSchema = z.strictObject({
  job: CloudJobSchema, input: CloudJobInputSchema, workerId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/),
  token: z.string().min(32).max(128).regex(/^[a-zA-Z0-9_-]+$/), expiresAt: z.iso.datetime(),
}).refine(lease => lease.job.type === lease.input.type && lease.job.status === 'running');
export type CloudLease = z.infer<typeof CloudLeaseSchema>;
export interface CloudRepository {
  projects(ownerId: string): Promise<CloudProjectSnapshot[]>;
  saveProject(ownerId: string, project: CloudProjectSnapshot): Promise<void>;
  project(ownerId: string, projectId: string): Promise<CloudProjectSnapshot | null>;
  enqueue(ownerId: string, projectId: string, input: CloudJobInput): Promise<CloudJob>;
  jobs(ownerId: string, projectId: string): Promise<CloudJob[]>;
  claim(workerId: string, target: 'cloud' | 'local'): Promise<CloudLease | null>;
  heartbeat(lease: CloudLease, progress: number): Promise<boolean>;
  complete(lease: CloudLease, result: unknown): Promise<boolean>;
  fail(lease: CloudLease, errorCode: string): Promise<boolean>;
}
