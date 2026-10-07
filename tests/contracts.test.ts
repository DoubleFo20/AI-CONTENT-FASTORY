import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdeas, validateStoryPackage, type Idea, type StoryPackage } from '../shared/contracts.js';

const text = (value: string) => ({ th: `${value} ไทย`, en: `${value} English` });

function idea(id: string): Idea {
  return { id, title: text(id), logline: text(`${id} logline`), hook: text(`${id} hook`) };
}

function storyPackage(): StoryPackage {
  return {
    storyBible: text('Story'),
    characters: [{ id: 'character_1', name: 'Mali', visualDescriptionEn: 'Blue jacket', background: text('Character') }],
    locations: [{ id: 'location_1', name: text('Garden'), visualDescriptionEn: 'Quiet garden', description: text('Location') }],
    continuityRules: [text('Keep jacket blue')],
    scenes: [1, 2, 3].map((order) => ({
      id: `scene_${order}`, order, title: text(`Scene ${order}`), durationSeconds: 20,
      explanationTh: `คำอธิบาย ${order}`, flowPromptEn: `Mali in the garden, shot ${order}`,
      narration: text(`Narration ${order}`), characterIds: ['character_1'], locationId: 'location_1',
    })),
  };
}

test('validateIdeas requires exactly ten ideas with unique ids', () => {
  assert.equal(validateIdeas(Array.from({ length: 10 }, (_, i) => idea(`idea_${i + 1}`))).length, 10);
  assert.throws(() => validateIdeas(Array.from({ length: 9 }, (_, i) => idea(`idea_${i}`))));
  assert.throws(() => validateIdeas(Array.from({ length: 10 }, () => idea('duplicate'))));
});

test('validateStoryPackage enforces references, contiguous order, unique ids, and <=180 seconds', () => {
  assert.equal(validateStoryPackage(storyPackage()).scenes.length, 3);
  const missingCharacter = storyPackage();
  missingCharacter.scenes[0].characterIds = ['unknown'];
  assert.throws(() => validateStoryPackage(missingCharacter));
  const missingLocation = storyPackage();
  missingLocation.scenes[1].locationId = 'unknown';
  assert.throws(() => validateStoryPackage(missingLocation));
  const gap = storyPackage();
  gap.scenes[2].order = 4;
  assert.throws(() => validateStoryPackage(gap));
  const tooLong = storyPackage();
  tooLong.scenes = Array.from({ length: 10 }, (_, index) => ({
    ...tooLong.scenes[index % tooLong.scenes.length], id: `scene_${index + 1}`, order: index + 1, durationSeconds: 20,
  }));
  assert.throws(() => validateStoryPackage(tooLong));
  const duplicate = storyPackage();
  duplicate.characters.push({ ...duplicate.characters[0] });
  assert.throws(() => validateStoryPackage(duplicate));
});
