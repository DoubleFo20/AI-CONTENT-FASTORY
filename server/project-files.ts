import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Project, Scene } from '../shared/contracts.js';
import { EditorSettingsSchema, FlowSettingsSchema, SceneProductionSchema, type ProductionState } from '../shared/production.js';
import { AppError } from './errors.js';

const AudioSchema = z.strictObject({
  id: z.uuid(), projectId: z.uuid(), originalName: z.string().min(1).max(255),
  durationSeconds: z.number().positive().max(3600), createdAt: z.iso.datetime(),
  filename: z.string().regex(/^[0-9a-f-]{36}\.(mp3|wav|m4a|ogg)$/),
});
export type StoredAudio = z.infer<typeof AudioSchema>;
const ImageSchema = z.strictObject({
  id: z.uuid(), projectId: z.uuid(), originalName: z.string().min(1).max(255),
  width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192), createdAt: z.iso.datetime(),
  filename: z.string().regex(/^[0-9a-f-]{36}\.(png|jpg|jpeg|webp)$/),
});
export type StoredImage = z.infer<typeof ImageSchema>;
const StateSchema = z.strictObject({
  version: z.literal(1), ownerId: z.uuid(), projectId: z.uuid(),
  flow: FlowSettingsSchema, editor: EditorSettingsSchema,
  scenes: z.record(z.string().min(1).max(64), SceneProductionSchema), audio: z.array(AudioSchema).max(50), images: z.array(ImageSchema).max(50).default([]),
});
type StoredState = z.infer<typeof StateSchema>;
export const ProductionPatchSchema = z.strictObject({
  flow: FlowSettingsSchema.optional(), editor: EditorSettingsSchema.optional(),
  scenes: z.record(z.string().min(1).max(64), SceneProductionSchema).optional(),
});

// Owner-scoped sidecar metadata avoids any migration of the populated SQLite database.
// Media stays in its original managed location; this file contains small configuration only.
export class ProjectFiles {
  constructor(private readonly dataDir: string) {}
  private path(project: Project, ownerId: string) {
    z.uuid().parse(ownerId); z.uuid().parse(project.id);
    return join(this.dataDir, 'settings', 'projects', `${project.id}.json`);
  }
  private load(project: Project, ownerId: string): StoredState {
    const path = this.path(project, ownerId);
    if (!existsSync(path)) return { version: 1, ownerId, projectId: project.id, flow: FlowSettingsSchema.parse({}), editor: EditorSettingsSchema.parse({}), scenes: {}, audio: [], images: [] };
    if (lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || statSync(path).size > 512 * 1024) throw new AppError('INTERNAL_ERROR', 500);
    const value = StateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    if (value.ownerId !== ownerId || value.projectId !== project.id) throw new AppError('NOT_FOUND', 404);
    return value;
  }
  private save(project: Project, ownerId: string, value: StoredState) {
    const path = this.path(project, ownerId); mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    const json = JSON.stringify(StateSchema.parse(value));
    if (Buffer.byteLength(json) > 512 * 1024) throw new AppError('INVALID_INPUT');
    writeFileSync(temporary, json, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  }
  state(project: Project, ownerId: string): ProductionState {
    const value = this.load(project, ownerId);
    return { flow: value.flow, editor: value.editor, scenes: value.scenes, audio: value.audio.map(({ filename: _private, ...publicAsset }) => { void _private; return publicAsset; }), images: value.images.map(({ filename: _private, ...publicAsset }) => { void _private; return publicAsset; }) };
  }
  update(project: Project, ownerId: string, input: unknown): ProductionState {
    const patch = ProductionPatchSchema.parse(input); const current = this.load(project, ownerId);
    const sceneIds = project.package?.scenes.map(scene => scene.id) ?? [];
    if (patch.scenes && (Object.keys(patch.scenes).length > 12 || Object.keys(patch.scenes).some(id => !sceneIds.includes(id)))) throw new AppError('INVALID_INPUT');
    if (patch.editor) {
      const settings = patch.editor;
      if (settings.sceneOrder.length && (settings.sceneOrder.length !== sceneIds.length || new Set(settings.sceneOrder).size !== sceneIds.length || settings.sceneOrder.some(id => !sceneIds.includes(id)))) throw new AppError('INVALID_INPUT');
      if ((settings.musicAssetId && !current.audio.some(asset => asset.id === settings.musicAssetId)) || settings.soundEffects.some(effect => !sceneIds.includes(effect.sceneId) || !current.audio.some(asset => asset.id === effect.assetId))) throw new AppError('INVALID_INPUT');
    }
    this.save(project, ownerId, { ...current, ...patch, scenes: { ...current.scenes, ...patch.scenes } });
    return this.state(project, ownerId);
  }
  addAudio(project: Project, ownerId: string, asset: StoredAudio) {
    const current = this.load(project, ownerId); const parsed = AudioSchema.parse(asset);
    if (parsed.projectId !== project.id || current.audio.length >= 50) throw new AppError('INVALID_INPUT');
    this.save(project, ownerId, { ...current, audio: [...current.audio, parsed] });
    return this.state(project, ownerId).audio.find(item => item.id === asset.id)!;
  }
  audio(project: Project, ownerId: string, assetId: string): StoredAudio {
    z.uuid().parse(assetId);
    const value = this.load(project, ownerId).audio.find(asset => asset.id === assetId);
    if (!value) throw new AppError('NOT_FOUND', 404);
    return value;
  }
  addImage(project: Project, ownerId: string, asset: StoredImage) {
    const current = this.load(project, ownerId); const parsed = ImageSchema.parse(asset);
    if (parsed.projectId !== project.id || current.images.length >= 50) throw new AppError('INVALID_INPUT');
    this.save(project, ownerId, { ...current, images: [...current.images, parsed] });
    return this.state(project, ownerId).images.find(item => item.id === asset.id)!;
  }
  image(project: Project, ownerId: string, assetId: string): StoredImage {
    z.uuid().parse(assetId);
    const value = this.load(project, ownerId).images.find(asset => asset.id === assetId);
    if (!value) throw new AppError('NOT_FOUND', 404);
    return value;
  }
  exportOptions(project: Project, ownerId: string) {
    const settings = this.load(project, ownerId).editor;
    const path = (id: string) => join(this.dataDir, 'audio', this.audio(project, ownerId, id).filename);
    return { settings, ...(settings.musicAssetId ? { music: { path: path(settings.musicAssetId) } } : {}), effects: settings.soundEffects.map(effect => ({ path: path(effect.assetId), sceneId: effect.sceneId, volume: effect.volume })) };
  }
}

export function flowPrompt(project: Project, scene: Scene, state: ProductionState): string {
  const pack = project.package!; const refs = state.scenes[scene.id];
  const characters = scene.characterIds.map(id => pack.characters.find(character => character.id === id)).filter(character => !!character);
  const location = pack.locations.find(item => item.id === scene.locationId)!;
  return [
    `Scene ID: ${scene.id}. Aspect ratio: ${project.aspectRatio === '1:1' ? '16:9 (keep all important action in the center square for a final 1:1 crop)' : project.aspectRatio}. Target scene duration: ${scene.durationSeconds} seconds.`,
    scene.flowPromptEn,
    ...characters.map(character => `Character ${character.id}: ${character.visualDescriptionEn}`),
    `Location ${location.id}: ${location.visualDescriptionEn}`,
    ...pack.continuityRules.map(rule => `Continuity: ${rule.en}`),
    ...(refs?.characterReference ? [`Use character reference asset: ${refs.characterReference}`] : []),
    ...(refs?.locationReference ? [`Use location reference asset: ${refs.locationReference}`] : []),
    `Save the completed clip as ${scene.id}.mp4. For scenes longer than one generation, produce sequential parts with matching final/first frames, then import a combined scene clip.`,
  ].join('\n');
}
export function creditEstimate(project: Project, state: ProductionState) {
  const scenes = project.package?.scenes ?? []; const settings = state.flow;
  const generations = scenes.filter(scene => !project.clips.some(clip => clip.sceneId === scene.id)).reduce((sum, scene) => sum + Math.ceil(scene.durationSeconds / settings.generationDurationSeconds), 0);
  const verified = settings.rateVerifiedByOwner && settings.creditsPerGeneration !== null;
  const estimatedCredits = verified ? generations * settings.creditsPerGeneration! : null;
  return { generations, estimatedCredits, budgetCredits: settings.budgetCredits, withinBudget: estimatedCredits !== null && settings.budgetCredits !== null ? estimatedCredits <= settings.budgetCredits : null, verifiedByOwner: verified, spendsCredits: false };
}

// A filename match is a suggestion only; the Owner confirms each import explicitly.
export function matchClip(project: Project, filename: string): string | null {
  const base = filename.replace(/\.(mp4|mov|webm)$/i, '');
  const matches = project.package?.scenes.filter(scene => base === scene.id || base.startsWith(`${scene.id}__`)) ?? [];
  return matches.length === 1 ? matches[0].id : null;
}
