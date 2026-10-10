import { z } from 'zod';

export const EditorSettingsSchema = z.strictObject({
  resolution: z.enum(['720p', '1080p']).default('1080p'),
  quality: z.enum(['draft', 'standard', 'high']).default('standard'),
  transition: z.enum(['cut', 'fade']).default('cut'),
  normalizeAudio: z.boolean().default(true),
  clipVolume: z.number().min(0).max(2).default(1),
  musicAssetId: z.uuid().nullable().default(null),
  musicVolume: z.number().min(0).max(1).default(0.2),
  subtitleLocale: z.enum(['off', 'th', 'en']).default('off'),
  sceneOrder: z.array(z.string().min(1).max(64)).max(12).default([]),
  soundEffects: z.array(z.strictObject({ assetId: z.uuid(), sceneId: z.string().min(1).max(64), volume: z.number().min(0).max(2) })).max(12).default([]),
});
export type EditorSettings = z.infer<typeof EditorSettingsSchema>;
export const FlowSettingsSchema = z.strictObject({
  model: z.string().trim().min(1).max(80).default('Google Flow'),
  creditsPerGeneration: z.number().min(0).max(10000).nullable().default(null),
  generationDurationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
  budgetCredits: z.number().min(0).max(1000000).nullable().default(null),
  rateVerifiedByOwner: z.boolean().default(false),
});
export type FlowSettings = z.infer<typeof FlowSettingsSchema>;
export const SceneProductionSchema = z.strictObject({
  status: z.enum(['planned', 'ready_for_flow', 'generating', 'failed']).default('planned'),
  notes: z.string().max(2000).default(''),
  characterReference: z.string().max(1000).default(''),
  locationReference: z.string().max(1000).default(''),
});
export type SceneProduction = z.infer<typeof SceneProductionSchema>;
export interface AudioAsset { id: string; projectId: string; originalName: string; durationSeconds: number; createdAt: string }
export interface ImageAsset { id: string; projectId: string; originalName: string; width: number; height: number; createdAt: string }
export interface ProductionState {
  flow: FlowSettings; editor: EditorSettings; scenes: Record<string, SceneProduction>; audio: AudioAsset[]; images: ImageAsset[];
}
