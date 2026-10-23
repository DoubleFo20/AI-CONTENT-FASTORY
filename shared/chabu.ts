import { z } from 'zod';

export interface ManualVideoProviderAdapter {
  id: string; role: 'primary' | 'supporting'; url: string;
  mode: 'manual_handoff'; automatedGeneration: false; apiVerified: false;
}
export const CHABU_FLOW_ADAPTER = {
  id: 'google_flow', role: 'primary', url: 'https://labs.google/fx/tools/flow',
  mode: 'manual_handoff', automatedGeneration: false, apiVerified: false,
} satisfies ManualVideoProviderAdapter;
export const CHABU_META_ADAPTER = {
  id: 'meta_ai', role: 'supporting', url: 'https://www.meta.ai/',
  mode: 'manual_handoff', automatedGeneration: false, apiVerified: false,
} satisfies ManualVideoProviderAdapter;

const text = z.string().trim().min(1).max(2000);
export const ChabuReferenceSchema = z.strictObject({ assetId: z.uuid(), angle: z.string().trim().min(1).max(100) });
const references = z.array(ChabuReferenceSchema).max(12);
export const ChabuCharacterInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), descriptionEn: text,
  identityRules: z.array(text).min(1).max(12), references,
});
export const ChabuProductInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), model: z.string().trim().max(120),
  variant: z.string().trim().max(120), descriptionEn: text,
  verifiedSpecifications: z.array(text).max(20), unverifiedClaims: z.array(text).max(20),
  prohibitedClaims: z.array(text).max(20), identityRules: z.array(text).min(1).max(12), references,
  affiliateUrl: z.union([z.literal(''), z.url().max(2000).refine(value => value.startsWith('https://'))]),
});
const version = { id: z.uuid(), revision: z.number().int().positive(), createdAt: z.iso.datetime() };
export const ChabuCharacterVersionSchema = ChabuCharacterInputSchema.extend(version);
export const ChabuProductVersionSchema = ChabuProductInputSchema.extend(version);
export const ChabuCharacterSchema = z.strictObject({ id: z.uuid(), versions: z.array(ChabuCharacterVersionSchema).min(1).max(100) });
export const ChabuProductSchema = z.strictObject({ id: z.uuid(), versions: z.array(ChabuProductVersionSchema).min(1).max(100) });
export const ChabuEpisodeInputSchema = z.strictObject({
  requestId: z.uuid(), name: z.string().trim().min(1).max(120), brief: z.string().trim().min(10).max(2000),
  characterId: z.uuid(), characterVersionId: z.uuid(), productId: z.uuid(), productVersionId: z.uuid(),
  clipCount: z.number().int().min(3).max(12).default(4),
  clipDurationSeconds: z.number().int().min(4).max(20).default(10),
  aspectRatio: z.enum(['9:16', '16:9']).default('9:16'),
}).refine(value => value.clipCount * value.clipDurationSeconds <= 180);
export const ChabuManualStageSchema = z.enum(['draft', 'awaiting_external_generation', 'awaiting_upload', 'cancelled']);
export const ChabuEpisodeSchema = z.strictObject({
  id: z.uuid(), input: ChabuEpisodeInputSchema, projectId: z.uuid(), createdAt: z.iso.datetime(),
  character: ChabuCharacterVersionSchema, product: ChabuProductVersionSchema,
  manualStage: ChabuManualStageSchema, promptVersion: z.literal(1),
  provider: z.literal('manual_flow_primary_meta_supporting'),
}).refine(value => value.input.characterVersionId === value.character.id && value.input.productVersionId === value.product.id, { message: 'Pinned version mismatch' });
export type ChabuCharacterInput = z.infer<typeof ChabuCharacterInputSchema>;
export type ChabuProductInput = z.infer<typeof ChabuProductInputSchema>;
export type ChabuCharacterVersion = z.infer<typeof ChabuCharacterVersionSchema>;
export type ChabuProductVersion = z.infer<typeof ChabuProductVersionSchema>;
export type ChabuEpisodeInput = z.infer<typeof ChabuEpisodeInputSchema>;
export type ChabuEpisode = z.infer<typeof ChabuEpisodeSchema>;
export const ChabuLibrarySchema = z.strictObject({
  schema: z.literal(1), ownerId: z.uuid(), libraryProjectId: z.uuid().nullable(),
  characters: z.array(ChabuCharacterSchema).max(100), products: z.array(ChabuProductSchema).max(100),
  episodes: z.array(ChabuEpisodeSchema).max(500),
});
export type ChabuLibrary = z.infer<typeof ChabuLibrarySchema>;
export const ChabuStateSchema = z.strictObject({
  libraryProjectId: z.uuid().nullable(), characters: ChabuLibrarySchema.shape.characters, products: ChabuLibrarySchema.shape.products,
  episodes: z.array(ChabuEpisodeSchema.safeExtend({
    project: z.object({ id: z.uuid(), name: z.string(), status: z.enum(['draft', 'ideas_ready', 'selected', 'expanded', 'clips_ready', 'exported']), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }),
    importedClips: z.number().int().nonnegative(),
    jobs: z.array(z.object({ id: z.uuid(), projectId: z.uuid(), projectName: z.string(), type: z.enum(['ideas', 'expand', 'export']), status: z.enum(['queued', 'running', 'completed', 'failed']), progress: z.number().min(0).max(100), errorCode: z.string().nullable(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })),
  })), execution: z.literal('local_only'),
});
export type ChabuState = z.infer<typeof ChabuStateSchema>;
