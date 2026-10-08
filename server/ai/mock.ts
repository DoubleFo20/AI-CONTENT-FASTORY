import {
  validateIdeas, validateStoryPackage,
  type Idea, type ProjectInput, type StoryPackage,
} from '../../shared/contracts.js';
import type { AiProvider } from './types.js';

const MOCK_TH = 'ข้อมูลตัวอย่าง MOCK';
const MOCK_EN = 'MOCK sample data';

function plainText(value: string, maxLength: number): string {
  const withoutMarkup = value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/[<>]/gu, '');
  const withoutControls = Array.from(withoutMarkup, (character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? ' ' : character;
    })
    .join('');
  return Array.from(withoutControls.replace(/\s+/gu, ' ').trim()).slice(0, maxLength).join('');
}

function idea(id: string, th: string, en: string): Idea {
  return {
    id,
    title: { th: `${MOCK_TH} • ${th}`, en: `${MOCK_EN} • ${en}` },
    logline: {
      th: `${MOCK_TH}: ${th} พบทางเลือกเล็ก ๆ ที่เปลี่ยนวันธรรมดา`,
      en: `${MOCK_EN}: ${en} finds a small choice that changes an ordinary day.`,
    },
    hook: {
      th: `${MOCK_TH}: สิ่งของชิ้นหนึ่งพาไปพบคำตอบ`,
      en: `${MOCK_EN}: One small object leads to an unexpected answer.`,
    },
  };
}

export function createMockProvider(): AiProvider {
  return {
    async generateIdeas(): Promise<Idea[]> {
      return validateIdeas([
        idea('mock_idea_1', 'จดหมายในกล่องดนตรี', 'The Music Box Letter'),
        idea('mock_idea_2', 'สถานีรถไฟยามเช้า', 'The Morning Platform'),
        idea('mock_idea_3', 'แผนที่ของคุณยาย', 'Grandmother’s Map'),
        idea('mock_idea_4', 'ร้านซ่อมร่มวันฝนตก', 'The Rainy Day Umbrella Shop'),
        idea('mock_idea_5', 'แสงไฟห้องตรงข้าม', 'The Light Across the Street'),
        idea('mock_idea_6', 'เมล็ดพันธุ์สุดท้าย', 'The Last Seed'),
        idea('mock_idea_7', 'แมวเฝ้าห้องสมุด', 'The Library Cat'),
        idea('mock_idea_8', 'โปสการ์ดที่ยังไม่ส่ง', 'The Unsent Postcard'),
        idea('mock_idea_9', 'เสียงเพลงจากชั้นบน', 'Music from Upstairs'),
        idea('mock_idea_10', 'วันที่นาฬิกาหยุดเดิน', 'The Day the Clock Stopped'),
      ]);
    },

    async expandStory(input: ProjectInput, selectedIdea: Idea): Promise<StoryPackage> {
      // Only the selected idea is used. Keep arbitrary user text plain and bounded.
      const projectName = plainText(input.name, 120) || 'Untitled story';
      const selectedTitleTh = plainText(selectedIdea.title.th, 120) || 'เรื่องที่เลือก';
      const selectedTitleEn = plainText(selectedIdea.title.en, 120) || 'Selected story';
      const titleTh = `${MOCK_TH} • ${selectedTitleTh}`;
      const titleEn = `${MOCK_EN} • ${selectedTitleEn}`;
      const characters = [{
        id: 'mock_character_1',
        name: `${MOCK_TH} / ${MOCK_EN} • Mali`,
        visualDescriptionEn: `${MOCK_EN}: Mali wears a simple blue jacket and carries a small notebook.`,
        background: {
          th: `${MOCK_TH}: มะลิเป็นตัวละครสมมติสำหรับตรวจหน้าจอ`,
          en: `${MOCK_EN}: Mali is a fictional character for interface review.`,
        },
      }];
      const locations = [{
        id: 'mock_location_1',
        name: { th: `${MOCK_TH} • สถานีเล็ก`, en: `${MOCK_EN} • Small Station` },
        visualDescriptionEn: `${MOCK_EN}: A quiet small station with a wooden bench and soft morning light.`,
        description: {
          th: `${MOCK_TH}: สถานีสมมติที่สงบและมีแสงเช้า`,
          en: `${MOCK_EN}: A fictional, quiet station in soft morning light.`,
        },
      }];
      const scenes = [1, 2, 3].map((order) => ({
        id: `mock_scene_${order}`,
        order,
        title: { th: `${MOCK_TH} • ฉาก ${order}`, en: `${MOCK_EN} • Scene ${order}` },
        durationSeconds: 8,
        explanationTh: `${MOCK_TH}: มะลิเปิดสมุดที่ ${projectName} และพบเบาะแสใหม่ในฉาก ${order}`,
        flowPromptEn: `${MOCK_EN}: Mali opens her notebook at ${projectName}; a gentle visual clue appears in scene ${order}. Maintain the same blue jacket and quiet station.`,
        narration: {
          th: `${MOCK_TH}: เรื่องราวค่อย ๆ เดินหน้าผ่านฉาก ${order}`,
          en: `${MOCK_EN}: The story moves forward in scene ${order}.`,
        },
        characterIds: ['mock_character_1'],
        locationId: 'mock_location_1',
      }));
      const result: StoryPackage = {
        storyBible: {
          th: `${MOCK_TH} • ${projectName}: ${titleTh}. เรื่องสมมตินี้ติดตามการค้นพบเบาะแสและจบอย่างอบอุ่น`,
          en: `${MOCK_EN} • ${projectName}: ${titleEn}. This sample story follows a small discovery and ends warmly.`,
        },
        characters,
        locations,
        continuityRules: [{
          th: `${MOCK_TH}: มะลิสวมเสื้อแจ็กเก็ตสีน้ำเงินและพกสมุดเล่มเดิมทุกฉาก`,
          en: `${MOCK_EN}: Mali wears the same blue jacket and carries the same notebook in every scene.`,
        }],
        scenes,
      };
      return validateStoryPackage(result);
    },
  };
}
