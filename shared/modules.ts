import type { LocalizedText } from './contracts.js';

export interface FactoryModule { id: string; name: LocalizedText; state: 'active' | 'planned'; capability: string }
export const FACTORY_MODULES: FactoryModule[] = [
  { id: 'story', name: { th: 'โรงงานเรื่องสั้น', en: 'Story Factory' }, state: 'active', capability: 'story-production' },
  { id: 'product-review', name: { th: 'โรงงานรีวิวสินค้า', en: 'Product Review Factory' }, state: 'planned', capability: 'product-review' },
  { id: 'kids-toy', name: { th: 'โรงงานเด็กและของเล่น', en: 'Kids & Toy Factory' }, state: 'planned', capability: 'kids-toy' },
  { id: 'investment', name: { th: 'ห้องทดลองการลงทุน', en: 'Investment Lab' }, state: 'planned', capability: 'investment-research' },
  { id: 'media', name: { th: 'คลังสื่อ', en: 'Media Library' }, state: 'planned', capability: 'media-browse' },
  { id: 'publish', name: { th: 'เผยแพร่', en: 'Publish' }, state: 'planned', capability: 'external-publish' },
  { id: 'settings', name: { th: 'ตั้งค่า', en: 'Settings' }, state: 'planned', capability: 'workspace-settings' },
];
