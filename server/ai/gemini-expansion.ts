import { z } from 'zod';
import {
  CharacterSchema, LocalizedTextSchema, LocationSchema, SceneSchema, StoryPackageSchema,
  validateStoryPackage, type StoryPackage,
} from '../../shared/contracts.js';

const CharacterDraftSchema = z.strictObject({
  name: CharacterSchema.shape.name,
  visualDescriptionEn: CharacterSchema.shape.visualDescriptionEn,
  backgroundTh: LocalizedTextSchema.shape.th,
  backgroundEn: LocalizedTextSchema.shape.en,
});
const LocationDraftSchema = z.strictObject({
  nameTh: LocalizedTextSchema.shape.th,
  nameEn: LocalizedTextSchema.shape.en,
  visualDescriptionEn: LocationSchema.shape.visualDescriptionEn,
  descriptionTh: LocalizedTextSchema.shape.th,
  descriptionEn: LocalizedTextSchema.shape.en,
});
const SceneDraftSchema = z.strictObject({
  titleTh: LocalizedTextSchema.shape.th,
  titleEn: LocalizedTextSchema.shape.en,
  durationSeconds: SceneSchema.shape.durationSeconds,
  explanationTh: SceneSchema.shape.explanationTh,
  flowPromptEn: SceneSchema.shape.flowPromptEn,
  narrationTh: LocalizedTextSchema.shape.th,
  narrationEn: LocalizedTextSchema.shape.en,
  characterIndices: z.array(z.number().int().min(1).max(6)).min(1).max(6)
    .refine(indices => new Set(indices).size === indices.length),
  locationIndex: z.number().int().min(1).max(6),
});

// IDs and localized wrappers are backend-owned; every content field remains AI-authored.
export const GeminiExpansionDraftSchema = z.strictObject({
  storyTh: LocalizedTextSchema.shape.th,
  storyEn: LocalizedTextSchema.shape.en,
  characters: z.array(CharacterDraftSchema).min(1).max(6),
  locations: z.array(LocationDraftSchema).min(1).max(6),
  rules: StoryPackageSchema.shape.continuityRules,
  scenes: z.array(SceneDraftSchema).min(3).max(12),
}).superRefine((draft, context) => {
  if (draft.scenes.reduce((total, scene) => total + scene.durationSeconds, 0) > 180) {
    context.addIssue({ code: 'custom', path: ['scenes'], message: 'Total scene duration exceeds 180 seconds' });
  }
  for (const [index, scene] of draft.scenes.entries()) {
    if (scene.characterIndices.some(reference => reference > draft.characters.length)) {
      context.addIssue({ code: 'custom', path: ['scenes', index, 'characterIndices'], message: 'Unknown character reference' });
    }
    if (scene.locationIndex > draft.locations.length) {
      context.addIssue({ code: 'custom', path: ['scenes', index, 'locationIndex'], message: 'Unknown location reference' });
    }
  }
});

const BiblesSchema = StoryPackageSchema.pick({ characters: true, locations: true });
const ContinuityScenesSchema = StoryPackageSchema.pick({ continuityRules: true, scenes: true });
const FlowSceneSchema = SceneSchema.pick({ explanationTh: true, flowPromptEn: true });

export function assembleGeminiStoryPackage(raw: unknown): StoryPackage {
  const draft = GeminiExpansionDraftSchema.parse(raw);
  // A: the complete bilingual story.
  const storyBible = LocalizedTextSchema.parse({ th: draft.storyTh, en: draft.storyEn });
  // B: stable character and location bibles, in draft array order.
  const bibles = BiblesSchema.parse({
    characters: draft.characters.map((character, index) => ({
      id: `character_${index + 1}`, name: character.name, visualDescriptionEn: character.visualDescriptionEn,
      background: { th: character.backgroundTh, en: character.backgroundEn },
    })),
    locations: draft.locations.map((location, index) => ({
      id: `location_${index + 1}`, name: { th: location.nameTh, en: location.nameEn },
      visualDescriptionEn: location.visualDescriptionEn,
      description: { th: location.descriptionTh, en: location.descriptionEn },
    })),
  });
  // C: continuity and scenes; references were checked against the actual draft bibles.
  const continuityScenes = ContinuityScenesSchema.parse({
    continuityRules: draft.rules,
    scenes: draft.scenes.map((scene, index) => ({
      id: `scene_${index + 1}`, order: index + 1,
      title: { th: scene.titleTh, en: scene.titleEn }, durationSeconds: scene.durationSeconds,
      explanationTh: scene.explanationTh, flowPromptEn: scene.flowPromptEn,
      narration: { th: scene.narrationTh, en: scene.narrationEn },
      characterIds: scene.characterIndices.map(reference => `character_${reference}`),
      locationId: `location_${scene.locationIndex}`,
    })),
  });
  // D: keep each Thai explanation and complete English Flow prompt exactly as authored.
  for (const scene of continuityScenes.scenes) {
    FlowSceneSchema.parse({ explanationTh: scene.explanationTh, flowPromptEn: scene.flowPromptEn });
  }
  return validateStoryPackage({ storyBible, ...bibles, ...continuityScenes });
}
