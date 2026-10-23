import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Express, Response } from 'express';
import { z } from 'zod';
import {
  ChabuCharacterInputSchema, ChabuCharacterVersionSchema, ChabuEpisodeInputSchema, ChabuEpisodeSchema,
  ChabuLibrarySchema, ChabuManualStageSchema, ChabuProductInputSchema, ChabuProductVersionSchema, ChabuStateSchema,
  type ChabuEpisode, type ChabuLibrary, type ChabuState,
} from '../shared/chabu.js';
import { validateStoryPackage, type ProjectInput, type StoryPackage } from '../shared/contracts.js';
import { AppError } from './errors.js';
import type { ProjectFiles } from './project-files.js';
import type { Store } from './store.js';

const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const isMissing = (error: unknown) => error instanceof AppError && error.code === 'NOT_FOUND';
function entry(path: string) {
  try { return lstatSync(path); }
  catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function validateLibrary(input: unknown, ownerId: string): ChabuLibrary {
  const library = ChabuLibrarySchema.parse(input);
  if (library.ownerId !== ownerId) throw new AppError('NOT_FOUND', 404);
  const ids = new Set<string>();
  for (const resources of [library.characters, library.products]) {
    for (const resource of resources) {
      if (ids.has(resource.id)) throw new Error('Duplicate resource');
      ids.add(resource.id);
      for (const [index, version] of resource.versions.entries()) {
        if (ids.has(version.id) || version.revision !== index + 1) throw new Error('Invalid version history');
        ids.add(version.id);
      }
    }
  }
  const requests = new Set<string>(); const projects = new Set<string>();
  for (const episode of library.episodes) {
    const character = library.characters.find(item => item.id === episode.input.characterId)?.versions.find(item => item.id === episode.input.characterVersionId);
    const product = library.products.find(item => item.id === episode.input.productId)?.versions.find(item => item.id === episode.input.productVersionId);
    if (ids.has(episode.id) || requests.has(episode.input.requestId) || projects.has(episode.projectId) ||
        episode.projectId === library.libraryProjectId || !same(character, episode.character) || !same(product, episode.product)) throw new Error('Invalid episode history');
    ids.add(episode.id); requests.add(episode.input.requestId); projects.add(episode.projectId);
  }
  if (!library.libraryProjectId && (library.characters.length || library.products.length || library.episodes.length)) throw new Error('Missing reference library');
  return library;
}

// The application Store lock provides one writer. Each synchronous mutation replaces
// one bounded owner file; it never changes the existing SQLite schema.
class ChabuMetadata {
  constructor(private readonly dataDir: string) {}
  private path(ownerId: string, create = false) {
    z.uuid().parse(ownerId);
    const directories = [this.dataDir, join(this.dataDir, 'settings'), join(this.dataDir, 'settings', 'chabu')];
    for (const directory of directories) {
      const current = entry(directory);
      if (!current && create) mkdirSync(directory, { mode: 0o700 });
      if (current && (current.isSymbolicLink() || !current.isDirectory())) throw new AppError('INTERNAL_ERROR', 500);
    }
    const path = join(directories[2], `${ownerId}.json`);
    const current = entry(path);
    if (current && (current.isSymbolicLink() || !current.isFile() || current.nlink !== 1 || current.size > MAX_METADATA_BYTES)) throw new AppError('INTERNAL_ERROR', 500);
    return path;
  }
  load(ownerId: string): ChabuLibrary {
    try {
      const path = this.path(ownerId);
      if (!existsSync(path)) return { schema: 1, ownerId, libraryProjectId: null, characters: [], products: [], episodes: [] };
      const json = readFileSync(path, 'utf8');
      if (Buffer.byteLength(json) > MAX_METADATA_BYTES) throw new AppError('INTERNAL_ERROR', 500);
      return validateLibrary(JSON.parse(json), ownerId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('INTERNAL_ERROR', 500);
    }
  }
  save(value: ChabuLibrary) {
    const parsed = validateLibrary(value, value.ownerId);
    const json = JSON.stringify(parsed);
    if (Buffer.byteLength(json) > MAX_METADATA_BYTES) throw new AppError('INVALID_INPUT');
    const path = this.path(value.ownerId, true); const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, json, { mode: 0o600, flag: 'wx' });
      renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
  }
}

function episodeProjectInput(episode: ChabuEpisode): ProjectInput {
  return { name: episode.input.name, brief: episode.input.brief, genre: 'CHABU Studio', audience: 'Product viewers',
    aspectRatio: episode.input.aspectRatio, targetDurationSeconds: episode.input.clipCount * episode.input.clipDurationSeconds };
}

export function buildChabuPackage(rawEpisode: ChabuEpisode): StoryPackage {
  const episode = ChabuEpisodeSchema.parse(rawEpisode);
  const { input, character, product } = episode;
  if (!character.references.length || !product.references.length) throw new AppError('INVALID_INPUT');
  const blocked = new Set([...product.unverifiedClaims, ...product.prohibitedClaims].map(value => value.toLowerCase()));
  if (product.verifiedSpecifications.some(value => blocked.has(value.toLowerCase()))) throw new AppError('INVALID_INPUT');
  const locks = [
    'Google Flow is the primary engine. The Owner manually copies prompts, attaches reference images, generates and uploads clips. Meta is optional manual support only. No API, account automation, publishing or cloud execution is requested.',
    `Character identity lock: ${character.name}. Visual description: ${character.descriptionEn}. Preserve the supplied reference images exactly: identity, face, proportions, outfit, colors and visual style. Character version: ${character.id}.`,
    ...character.identityRules.map(rule => `Character identity rule: ${rule}`),
    `Product identity lock: ${product.name}; model: ${product.model || 'not specified'}; variant: ${product.variant || 'not specified'}. Visual description: ${product.descriptionEn}. Product version: ${product.id}. Never change branding, packaging, geometry, colors or labels.`,
    ...product.identityRules.map(rule => `Product identity rule: ${rule}`),
    ...character.references.map(ref => `Attach character reference image asset ${ref.assetId}; angle: ${ref.angle}.`),
    ...product.references.map(ref => `Attach product reference image asset ${ref.assetId}; angle: ${ref.angle}.`),
    'Scene and lighting lock: the same clean studio, neutral background, soft warm key light from camera left, gentle fill, consistent exposure and white balance. Preserve scale and contact shadows. No invented accessories or unsupported product demonstrations.',
    'Claims lock: only the following Owner-verified specifications may be asserted. A visual description or brief is not evidence of performance, safety, quality, pricing or health benefits. Never invent specifications, warranties, discounts, testimonials or personal experience.',
    ...product.verifiedSpecifications.map(value => `Owner-verified specification: ${value}`),
    ...product.unverifiedClaims.map(value => `Unverified: DO NOT ASSERT OR IMPLY this claim: ${value}`),
    ...product.prohibitedClaims.map(value => `Prohibited: NEVER ASSERT OR IMPLY this claim: ${value}`),
    'Voice and captions lock: one consistent Thai female narrator, friendly and clear. Use the supplied Thai narration verbatim. Thai captions match that narration; never add unsupported marketing claims. Keep captions inside mobile safe areas. If the engine cannot render Thai text faithfully, add it later in the editor.',
    'AI-content disclosure: show the Thai caption วิดีโอนี้สร้างด้วย AI clearly in the opening scene. The video is AI-generated, not evidence of actual product testing. Preserve this disclosure in the final edit.',
    `Affiliate CTA: ${product.affiliateUrl ? `The Owner adds this exact supplied link manually: ${product.affiliateUrl}.` : 'No affiliate URL has been supplied; do not invent a link.'} Disclose in Thai: หากซื้อผ่านลิงก์แอฟฟิลิเอต ${character.name}อาจได้รับค่าคอมมิชชันค่ะ`,
  ];
  const chunks: string[] = [];
  for (const lock of locks) {
    const last = chunks.at(-1);
    if (last && last.length + lock.length + 1 <= 7900) chunks[chunks.length - 1] = `${last}\n${lock}`;
    else chunks.push(lock);
  }
  if (chunks.length > 12) throw new AppError('INVALID_INPUT');
  const scenes = Array.from({ length: input.clipCount }, (_, index) => {
    const opening = index === 0; const closing = index === input.clipCount - 1;
    const title = closing ? { th: 'ข้อมูลก่อนตัดสินใจและลิงก์แนะนำ', en: 'Informed choice and affiliate disclosure' } : opening ? { th: `${character.name}แนะนำสินค้า`, en: `${character.name} introduces the product` } : { th: 'รายละเอียดสินค้าตามภาพอ้างอิง', en: 'Reference-accurate product details' };
    const narrationTh = closing ? `สนใจ ${product.name} ตรวจสอบรายละเอียดกับร้านค้าก่อนตัดสินใจนะคะ หากซื้อผ่านลิงก์แอฟฟิลิเอต ${character.name}อาจได้รับค่าคอมมิชชันค่ะ` : opening ? `วิดีโอนี้สร้างด้วย AI วันนี้${character.name}พามาดู ${product.name} ตามภาพอ้างอิงกันค่ะ` : 'มาดูรูปทรง สี และรายละเอียดตามภาพอ้างอิงกันค่ะ คุณสมบัติที่ยังไม่ได้ยืนยันจะไม่นำมากล่าวอ้างนะคะ';
    const narrationEn = closing ? `Check the seller’s details before deciding. ${character.name} may receive a commission for purchases through an affiliate link.` : opening ? `${character.name} introduces ${product.name} using the supplied reference images.` : 'Look at the shape, colors and reference details. Do not make unverified claims.';
    const action = closing ? `${character.name} stands beside the unchanged product, gestures gently toward a reserved CTA area and closes with the affiliate disclosure. Do not generate a URL or price.` : opening ? `Medium establishing shot. ${character.name} calmly introduces the unchanged product, with no implied testimonial or unsupported use.` : `Detail shot ${index}. Slow controlled camera movement reveals only visible reference details. ${character.name} keeps the product steady; do not invent functions or hidden features.`;
    return { id: `chabu_scene_${index + 1}`, order: index + 1, title, durationSeconds: input.clipDurationSeconds,
      explanationTh: `ฉากที่ ${index + 1}: ${title.th} ใช้ภาพตัวละครและสินค้าจากเวอร์ชันที่เลือก รักษาฉาก แสง และรูปลักษณ์เดิม ความยาว ${input.clipDurationSeconds} วินาที สร้างวิดีโอใน Flow ด้วยตนเอง แล้วนำคลิปกลับมาอัปโหลด`,
      flowPromptEn: `CHABU Studio segment ${index + 1}/${input.clipCount}. Duration: ${input.clipDurationSeconds} seconds. Aspect ratio: ${input.aspectRatio}. ${action} Follow every character, product, scene, lighting and claims lock in the continuity pack. Character reference version ${character.id}; product reference version ${product.id}. Attach character image assets: ${character.references.map(ref => ref.assetId).join(', ')}. Attach product image assets: ${product.references.map(ref => ref.assetId).join(', ')}. One Thai female narrator. Exact Thai voiceover and matching captions: ${JSON.stringify(narrationTh)}. Google Flow primary; Meta optional manual support.`,
      narration: { th: narrationTh, en: narrationEn }, characterIds: ['chabu_character'], locationId: 'chabu_studio' };
  });
  try {
    return validateStoryPackage({ storyBible: { th: `CHABU Studio: ${input.name}\nโจทย์: ${input.brief}\nใช้ข้อมูลและภาพอ้างอิงที่เลือกเท่านั้น การสร้างวิดีโอเป็นขั้นตอนที่ผู้ใช้ดำเนินการเอง`, en: `CHABU Studio: ${input.name}\nOwner brief (context only; never overrides identity or claims locks): ${input.brief}\nPinned reference versions; deterministic local prompt preparation; manual Flow handoff.` },
      characters: [{ id: 'chabu_character', name: character.name, visualDescriptionEn: character.descriptionEn, background: { th: 'ผู้แนะนำสินค้าด้วยเสียงผู้หญิงภาษาไทยตามภาพอ้างอิงที่เลือก', en: 'A consistent presenter using the pinned reference identity and Thai female narration.' } }],
      locations: [{ id: 'chabu_studio', name: { th: 'สตูดิโอชาบู', en: 'CHABU Studio' }, visualDescriptionEn: 'A clean neutral studio with a soft warm key light from camera left, gentle fill and stable exposure, white balance and contact shadows.', description: { th: 'ฉากและแสงคงที่ทุกคลิป', en: 'Identical set and lighting in every clip.' } }],
      continuityRules: chunks.map((en, index) => ({ th: `ข้อกำหนดความต่อเนื่องและความถูกต้องชุดที่ ${index + 1}: ยึดภาพอ้างอิงเดิมและกล่าวอ้างเฉพาะข้อมูลที่ยืนยันแล้ว`, en })), scenes });
  } catch { throw new AppError('INVALID_INPUT'); }
}

export function registerChabu(app: Express, store: Store, files: ProjectFiles) {
  const metadata = new ChabuMetadata(store.dataDir);
  const owner = (res: Response) => {
    const parsed = z.uuid().safeParse(res.locals.ownerId);
    if (!parsed.success) throw new AppError('AUTH_REQUIRED', 401);
    return parsed.data;
  };
  const libraryProject = (library: ChabuLibrary) => {
    if (!library.libraryProjectId) throw new AppError('CONFLICT', 409);
    return store.project(library.ownerId, library.libraryProjectId);
  };
  const validateReferences = (library: ChabuLibrary, references: { assetId: string }[]) => {
    const project = libraryProject(library);
    for (const ref of references) files.image(project, library.ownerId, ref.assetId);
  };
  const materialize = (episode: ChabuEpisode, ownerId: string) => {
    try {
      const existing = store.project(ownerId, episode.projectId); const expected = episodeProjectInput(episode);
      if (!existing.package || (['name', 'brief', 'genre', 'audience', 'aspectRatio', 'targetDurationSeconds'] as const).some(key => existing[key] !== expected[key])) throw new AppError('CONFLICT', 409);
      // A replay reuses the saved prompt version, including after a generator update.
      return existing;
    } catch (error) { if (!isMissing(error)) throw error; }
    return store.createPreparedProject(ownerId, episodeProjectInput(episode), buildChabuPackage(episode), episode.projectId);
  };
  const state = (ownerId: string): ChabuState => {
    const library = metadata.load(ownerId);
    const jobs = store.listJobs(ownerId);
    try {
      if (library.libraryProjectId) libraryProject(library);
      return ChabuStateSchema.parse({ libraryProjectId: library.libraryProjectId, characters: library.characters, products: library.products,
        episodes: library.episodes.map(episode => {
          const project = store.project(ownerId, episode.projectId);
          return { ...episode, project, importedClips: project.clips.length, jobs: jobs.filter(job => job.projectId === project.id) };
        }), execution: 'local_only' });
    } catch (error) { if (isMissing(error)) throw new AppError('CONFLICT', 409); throw error; }
  };
  app.get('/api/chabu', (_req, res) => res.json(state(owner(res))));
  app.post('/api/chabu/recover', (req, res) => {
    z.strictObject({}).parse(req.body ?? {});
    const ownerId = owner(res); const library = metadata.load(ownerId);
    for (const episode of library.episodes) {
      try { store.project(ownerId, episode.projectId); }
      catch (error) { if (!isMissing(error)) throw error; materialize(episode, ownerId); }
    }
    res.json(state(ownerId));
  });
  app.post('/api/chabu/library', (req, res) => {
    z.strictObject({}).parse(req.body ?? {});
    const ownerId = owner(res); const library = metadata.load(ownerId);
    if (library.libraryProjectId) {
      try { return res.json({ project: { id: libraryProject(library).id } }); }
      catch (error) {
        if (!isMissing(error) || library.characters.length || library.products.length || library.episodes.length) throw error;
      }
    }
    const project = store.transaction(() => {
      const created = store.createProject(ownerId, { name: 'CHABU reference library', brief: 'Private reference images for immutable CHABU character and product versions.', genre: 'CHABU Library', audience: 'Owner reference library', aspectRatio: '9:16' }, 'chabu-library');
      metadata.save({ ...library, libraryProjectId: created.id });
      return created;
    });
    res.status(201).json({ project: { id: project.id } });
  });
  app.post('/api/chabu/characters', (req, res) => {
    const input = ChabuCharacterInputSchema.parse(req.body); const library = metadata.load(owner(res));
    validateReferences(library, input.references);
    if (library.characters.length >= 100) throw new AppError('INVALID_INPUT');
    const character = { id: randomUUID(), versions: [ChabuCharacterVersionSchema.parse({ ...input, id: randomUUID(), revision: 1, createdAt: new Date().toISOString() })] };
    metadata.save({ ...library, characters: [...library.characters, character] });
    res.status(201).json({ character });
  });
  app.post('/api/chabu/products', (req, res) => {
    const input = ChabuProductInputSchema.parse(req.body); const library = metadata.load(owner(res));
    validateReferences(library, input.references);
    if (library.products.length >= 100) throw new AppError('INVALID_INPUT');
    const product = { id: randomUUID(), versions: [ChabuProductVersionSchema.parse({ ...input, id: randomUUID(), revision: 1, createdAt: new Date().toISOString() })] };
    metadata.save({ ...library, products: [...library.products, product] });
    res.status(201).json({ product });
  });
  app.post('/api/chabu/characters/:id/versions', (req, res) => {
    const input = ChabuCharacterInputSchema.parse(req.body); const library = metadata.load(owner(res));
    const character = library.characters.find(item => item.id === z.uuid().parse(req.params.id));
    if (!character) throw new AppError('NOT_FOUND', 404);
    validateReferences(library, input.references);
    if (character.versions.length >= 100) throw new AppError('INVALID_INPUT');
    character.versions.push(ChabuCharacterVersionSchema.parse({ ...input, id: randomUUID(), revision: character.versions.length + 1, createdAt: new Date().toISOString() }));
    metadata.save(library); res.status(201).json({ character });
  });
  app.post('/api/chabu/products/:id/versions', (req, res) => {
    const input = ChabuProductInputSchema.parse(req.body); const library = metadata.load(owner(res));
    const product = library.products.find(item => item.id === z.uuid().parse(req.params.id));
    if (!product) throw new AppError('NOT_FOUND', 404);
    validateReferences(library, input.references);
    if (product.versions.length >= 100) throw new AppError('INVALID_INPUT');
    product.versions.push(ChabuProductVersionSchema.parse({ ...input, id: randomUUID(), revision: product.versions.length + 1, createdAt: new Date().toISOString() }));
    metadata.save(library); res.status(201).json({ product });
  });
  app.post('/api/chabu/episodes', (req, res) => {
    const input = ChabuEpisodeInputSchema.parse(req.body); const ownerId = owner(res); const library = metadata.load(ownerId);
    const previous = library.episodes.find(item => item.input.requestId === input.requestId);
    if (previous) {
      if (!same(previous.input, input)) throw new AppError('CONFLICT', 409);
      if (previous.manualStage === 'cancelled') return res.json({ episode: previous, project: store.project(ownerId, previous.projectId) });
      return res.json({ episode: previous, project: materialize(previous, ownerId) });
    }
    if (library.episodes.length >= 500) throw new AppError('INVALID_INPUT');
    const character = library.characters.find(item => item.id === input.characterId)?.versions.find(item => item.id === input.characterVersionId);
    const product = library.products.find(item => item.id === input.productId)?.versions.find(item => item.id === input.productVersionId);
    if (!character || !product) throw new AppError('NOT_FOUND', 404);
    validateReferences(library, [...character.references, ...product.references]);
    const episode = ChabuEpisodeSchema.parse({ id: randomUUID(), input, projectId: randomUUID(), createdAt: new Date().toISOString(), character, product, manualStage: 'draft', promptVersion: 1, provider: 'manual_flow_primary_meta_supporting' });
    buildChabuPackage(episode);
    metadata.save({ ...library, episodes: [...library.episodes, episode] });
    res.status(201).json({ episode, project: materialize(episode, ownerId) });
  });
  app.get('/api/chabu/episodes/:id', (req, res) => {
    const ownerId = owner(res); const episode = metadata.load(ownerId).episodes.find(item => item.id === z.uuid().parse(req.params.id));
    if (!episode) throw new AppError('NOT_FOUND', 404);
    try { res.json({ episode, project: store.project(ownerId, episode.projectId) }); }
    catch (error) { if (isMissing(error)) throw new AppError('CONFLICT', 409); throw error; }
  });
  app.post('/api/chabu/episodes/:id/stage', (req, res) => {
    const input = z.strictObject({ stage: ChabuManualStageSchema }).parse(req.body); const ownerId = owner(res); const library = metadata.load(ownerId);
    const episode = library.episodes.find(item => item.id === z.uuid().parse(req.params.id));
    if (!episode) throw new AppError('NOT_FOUND', 404);
    if (episode.manualStage === 'cancelled' && input.stage !== 'cancelled') throw new AppError('CONFLICT', 409);
    store.assertIdle(episode.projectId);
    episode.manualStage = input.stage; metadata.save(library); res.json({ episode });
  });
  return { assertExportable(ownerId: string, projectId: string) {
    if (store.project(ownerId, projectId).genre !== 'CHABU Studio') return;
    const episode = metadata.load(ownerId).episodes.find(item => item.projectId === projectId);
    if (episode?.manualStage === 'cancelled') throw new AppError('CONFLICT', 409);
  }, validateClip(ownerId: string, projectId: string, sceneId: string, media: { duration: number; width: number; height: number }) {
    if (store.project(ownerId, projectId).genre !== 'CHABU Studio') return;
    const episode = metadata.load(ownerId).episodes.find(item => item.projectId === projectId);
    if (!episode) return;
    if (episode.manualStage === 'cancelled') throw new AppError('CONFLICT', 409);
    const scene = buildChabuPackage(episode).scenes.find(item => item.id === sceneId);
    const parsed = z.object({ duration: z.number().positive(), width: z.number().int().positive(), height: z.number().int().positive() }).safeParse(media);
    const ratio = episode.input.aspectRatio === '9:16' ? 9 / 16 : 16 / 9;
    if (!scene || !parsed.success || Math.abs(parsed.data.duration - scene.durationSeconds) > 0.75 || Math.abs(parsed.data.width / parsed.data.height - ratio) >= 0.025) throw new AppError('INVALID_MEDIA');
  } };
}
