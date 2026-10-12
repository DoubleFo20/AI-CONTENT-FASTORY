import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { IdeaSchema, ProjectInputSchema, validateIdeas, validateStoryPackage } from '../shared/contracts.ts';
import { EditorSettingsSchema, FlowSettingsSchema, SceneProductionSchema } from '../shared/production.ts';
import { creditEstimate, flowPrompt } from '../server/project-files.ts';

// Run with node --import tsx. This offline tool never opens an application DB,
// copies media, calls a provider, or accepts credentials as output fields.
const MAX_INPUT_BYTES = 1024 * 1024;
const IdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/)
  .refine(id => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(id));
const ProviderSchema = z.enum(['mock', 'gemini', 'openai']);
const ClipSchema = z.object({ id: z.uuid(), projectId: z.uuid(), sceneId: IdSchema, durationSeconds: z.number().positive().max(180) });
const AudioSchema = z.object({ id: z.uuid(), projectId: z.uuid(), durationSeconds: z.number().positive().max(3600) });
const ImageSchema = z.object({ id: z.uuid(), projectId: z.uuid(), width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) });
const InputSchema = z.strictObject({
  project: ProjectInputSchema.extend({
    id: z.uuid(), ideas: z.array(IdeaSchema).length(10), selectedIdeaId: IdSchema,
    package: z.unknown(), clips: z.array(ClipSchema).max(12).default([]),
    generation: z.object({ ideas: ProviderSchema.optional(), expansion: ProviderSchema.optional() }).default({}),
  }).strip(),
  productionState: z.object({
    flow: FlowSettingsSchema, editor: EditorSettingsSchema,
    scenes: z.record(IdSchema, SceneProductionSchema).default({}),
    audio: z.array(AudioSchema).max(50).default([]), images: z.array(ImageSchema).max(50).default([]),
  }),
  // These labels are declarations, never evidence that a real file was inspected.
  clipProvenance: z.record(z.uuid(), z.enum(['REAL_FLOW_OWNER_DECLARED', 'SYNTHETIC_MEDIA', 'UNKNOWN'])).default({}),
});

function fail(code) { throw new Error(code); }
function inside(root, path) {
  const child = relative(root, path);
  return !!child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}
function assertOrdinaryPath(path) {
  let cursor = parse(path).root;
  for (const part of relative(cursor, path).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    try {
      if (lstatSync(cursor).isSymbolicLink()) fail('UNSAFE_PATH');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }
}
function assertSafeStrings(value) {
  // Do not copy credential-shaped content accidentally placed in story/ref fields.
  if (typeof value === 'string' && (Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  })
    || /(?:sk-(?:proj-|svcacct-)?[a-zA-Z0-9_-]{16,}|AIza[a-zA-Z0-9_-]{20,}|Bearer\s+\S+|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/\S*[?&](?:token|key|api_key|access_token|signature|sig)=)/iu.test(value))) fail('PRIVATE_CONTENT_REJECTED');
  if (Array.isArray(value)) value.forEach(assertSafeStrings);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertSafeStrings);
}

export function buildProductionAcceptance(input) {
  let parsed;
  try {
    parsed = InputSchema.parse(input);
    parsed.project.ideas = validateIdeas(parsed.project.ideas);
    parsed.project.package = validateStoryPackage(parsed.project.package);
  } catch { fail('INVALID_ACCEPTANCE_INPUT'); }
  const { project, productionState: state, clipProvenance } = parsed;
  assertSafeStrings(parsed);
  const pack = project.package;
  const selected = project.ideas.find(idea => idea.id === project.selectedIdeaId);
  if (!selected) fail('INVALID_SELECTION');
  const duration = pack.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  if (!project.targetDurationSeconds || project.targetDurationSeconds < 20 || project.targetDurationSeconds > 60
    || duration !== project.targetDurationSeconds) fail('FIRST_ACCEPTANCE_DURATION_REQUIRED');
  for (const item of [...pack.scenes, ...pack.characters, ...pack.locations]) {
    if (!IdSchema.safeParse(item.id).success) fail('UNSAFE_SCENE_OR_REFERENCE_ID');
  }
  const sceneIds = new Set(pack.scenes.map(scene => scene.id));
  if (Object.keys(state.scenes).some(id => !sceneIds.has(id))) fail('INVALID_PRODUCTION_REFERENCES');
  const order = state.editor.sceneOrder;
  if (order.length && (order.length !== sceneIds.size || new Set(order).size !== sceneIds.size || order.some(id => !sceneIds.has(id)))) fail('INVALID_PRODUCTION_REFERENCES');
  for (const assets of [state.audio, state.images, project.clips]) {
    if (new Set(assets.map(asset => asset.id)).size !== assets.length || assets.some(asset => asset.projectId !== project.id)) fail('INVALID_PRODUCTION_REFERENCES');
  }
  const audioIds = new Set(state.audio.map(asset => asset.id));
  if ((state.editor.musicAssetId && !audioIds.has(state.editor.musicAssetId))
    || state.editor.soundEffects.some(effect => !audioIds.has(effect.assetId) || !sceneIds.has(effect.sceneId))
    || new Set(project.clips.map(clip => clip.sceneId)).size !== project.clips.length
    || project.clips.some(clip => !sceneIds.has(clip.sceneId))
    || Object.keys(clipProvenance).some(id => !project.clips.some(clip => clip.id === id))) fail('INVALID_PRODUCTION_REFERENCES');
  if (pack.scenes.some(scene => new Set(scene.characterIds).size !== scene.characterIds.length)) fail('INVALID_PRODUCTION_REFERENCES');

  const scenes = pack.scenes.map(scene => {
    const production = state.scenes[scene.id] ?? SceneProductionSchema.parse({});
    const clip = project.clips.find(item => item.sceneId === scene.id);
    const promptEn = flowPrompt(project, scene, state);
    if (/[\u0e00-\u0e7f]/u.test(promptEn) || !/[\u0e00-\u0e7f]/u.test(scene.explanationTh)) fail('INVALID_HANDOFF_LANGUAGE');
    return {
      sceneId: scene.id, order: scene.order, filename: `${scene.id}.mp4`,
      durationSeconds: scene.durationSeconds, aspectRatio: project.aspectRatio,
      flowAspectRatio: project.aspectRatio === '1:1' ? '16:9' : project.aspectRatio,
      promptEn, explanationTh: scene.explanationTh, narration: scene.narration,
      characterIds: scene.characterIds, locationId: scene.locationId,
      references: { character: production.characterReference || null, location: production.locationReference || null },
      productionStatus: production.status,
      clip: clip ? { id: clip.id, durationSeconds: clip.durationSeconds, provenance: clipProvenance[clip.id] ?? 'UNKNOWN', fileVerified: false } : null,
      requiredGenerations: Math.ceil(scene.durationSeconds / state.flow.generationDurationSeconds),
    };
  });
  const existingEstimate = creditEstimate(project, state);
  // Synthetic/unknown metadata cannot reduce the real-Flow preparation estimate.
  const preparationEstimate = creditEstimate({ ...project, clips: project.clips.filter(clip => clipProvenance[clip.id] === 'REAL_FLOW_OWNER_DECLARED') }, state);
  const providers = [project.generation.ideas, project.generation.expansion];
  const text = providers.every(provider => provider === 'gemini' || provider === 'openai') ? 'REAL_TEXT'
    : providers.every(provider => provider === 'mock') ? 'MOCK_ONLY' : 'UNKNOWN';
  const missingClips = scenes.filter(scene => !scene.clip || scene.clip.provenance !== 'REAL_FLOW_OWNER_DECLARED').map(scene => ({ sceneId: scene.sceneId, filename: scene.filename, reason: !scene.clip ? 'MISSING' : scene.clip.provenance }));
  return {
    version: 1, purpose: 'OFFLINE_OWNER_OPERATED_FLOW_HANDOFF', visibility: 'PRIVATE_LOCAL_ONLY',
    permissions: { directoryMode: '0700', fileMode: '0600', scope: 'POSIX_MODES_ONLY', inheritedWindowsAcl: 'NOT_VERIFIED_BY_CLI' },
    provenance: { text, textProviders: project.generation, textEvidence: 'SNAPSHOT_PROVIDER_METADATA_ONLY', media: project.clips.some(clip => clipProvenance[clip.id] === 'SYNTHETIC_MEDIA') ? 'SYNTHETIC_MEDIA' : project.clips.length ? 'OWNER_DECLARATIONS_ONLY' : 'NONE', liveCallsThisRun: 0, mediaFilesVerified: false },
    project: { id: project.id, name: project.name, aspectRatio: project.aspectRatio, targetDurationSeconds: duration, selectedIdea: selected },
    storyBible: pack.storyBible, characters: pack.characters, locations: pack.locations, continuityRules: pack.continuityRules,
    flowSettings: state.flow, editorSettings: state.editor,
    audio: state.audio.map(asset => ({ id: asset.id, durationSeconds: asset.durationSeconds })),
    images: state.images.map(asset => ({ id: asset.id, width: asset.width, height: asset.height })),
    scenes, missingClips, creditEstimate: preparationEstimate, snapshotCreditEstimate: existingEstimate,
    review: { narrative: 'OWNER_REVIEW_REQUIRED', editorial: 'OWNER_REVIEW_REQUIRED', referenceRights: 'OWNER_REVIEW_REQUIRED', videoAcceptance: 'NOT_VERIFIED', automaticGeneration: false, automaticPaidSpend: false },
  };
}

function instructions(bundle) {
  return [
    '# ชุดส่งต่องาน Google Flow แบบออฟไลน์ — ส่วนตัว',
    '',
    `เป้าหมาย ${bundle.project.targetDurationSeconds} วินาที สัดส่วน ${bundle.project.aspectRatio}; สร้างจากเรื่องที่เลือกเพียงเรื่องเดียว`,
    `ที่มาข้อความ: ${bundle.provenance.text} (อ้างอิง metadata เท่านั้น); สื่อ: ${bundle.provenance.media}`,
    'เครื่องมือนี้ไม่ได้เรียกบริการ สร้างวิดีโอ ตรวจไฟล์สื่อ หรือใช้เครดิต ชุดนี้ยังไม่ใช่หลักฐานยอมรับวิดีโอจริง',
    'เก็บชุดนี้เป็นส่วนตัว ห้าม commit หรือเผยแพร่ story/prompt/ref; POSIX ใช้ directory 0700/file 0600 แต่ Windows ต้องให้ Owner ตรวจ inherited NTFS ACL ก่อนใช้ข้อมูลจริง',
    '',
    '1. Owner ตรวจ narrative: เหตุและผล การเปิดเรื่อง จุดเปลี่ยน บทสรุป และ narration ให้สอดคล้องกับเวลารวม',
    '2. ตรวจสิทธิ์และเตรียมภาพอ้างอิงตัวละคร/สถานที่ ใช้ภาพเดิมทุกฉาก ตรวจเสื้อผ้า สี ใบหน้า ฉาก แสง และ continuity rules; ข้อความอ้างอิงยังไม่ใช่ไฟล์ภาพที่ตรวจแล้ว',
    '3. Owner เปิด Google Flow ทางการด้วยตนเอง ตรวจ model/ความยาว/อัตราเครดิต/งบปัจจุบันก่อนเริ่มทุก generation; ค่าเครดิตเป็น unknown จน rateVerifiedByOwner=true',
    '4. วาง canonical English prompt จากไฟล์ scenes/ ทีละฉาก ตรวจสัดส่วน; 1:1 ใช้ 16:9 โดยเก็บ action กลางภาพสำหรับ crop',
    '5. ฉากยาวกว่าหนึ่ง generation ให้สร้างต่อเนื่องโดยใช้ final/first frame ที่ตรงกัน รวมส่วนเป็นคลิปหนึ่งฉากก่อน import; ตรวจเวลาแต่ละฉากตาม manifest',
    '6. บันทึกคลิปตามชื่อ filename ใน manifest และ canonical prompt อย่างตรงตัว: scene ID เดิมตามด้วย .mp4 (ไม่มี subfolder) ตรวจผลจับคู่ scene ID และให้ Owner ยืนยันก่อน import',
    '7. หาก Flow ล้มเหลว ให้บันทึก failed/notes ในแอป เก็บคลิปที่สำเร็จไว้ ตรวจ prompt/ref และอัตราเครดิตก่อน Owner สั่งลองใหม่เอง ห้าม automatic retry/fallback',
    '8. ตรวจ editorial: scene order, cut/fade, subtitle TH/EN, clip volume, music และ SFX; เลือก audio ที่มีสิทธิ์ใช้ในแอป ไม่ถือว่า metadata คือไฟล์พร้อมใช้',
    '9. ตรวจคลิปจริงทุกฉากและรายการ missingClips จากนั้น import ผ่านแอปและ export MP4; ตรวจภาพ เสียง narration เพลง/SFX ระยะเวลา 20–60 วินาที และสัดส่วนจริงก่อนรับงาน',
    '10. เมื่อเริ่มรอบส่งต่อใหม่ ใช้ snapshot ใหม่และ output directory ใหม่ ห้ามเขียนทับชุดเดิม; เก็บชุดเดิมไว้เพื่อ recovery',
    '',
    ...bundle.scenes.flatMap(scene => [
      `## ฉาก ${scene.order}: ${scene.sceneId} → ${scene.filename} (${scene.durationSeconds}s)`,
      scene.explanationTh,
      `ตัวละคร: ${scene.characterIds.join(', ')}; สถานที่: ${scene.locationId}`,
      `อ้างอิงตัวละคร: ${scene.references.character ?? 'MISSING — Owner ต้องเตรียม/ยืนยัน'}; อ้างอิงสถานที่: ${scene.references.location ?? 'MISSING — Owner ต้องเตรียม/ยืนยัน'}`,
      `คลิป: ${scene.clip?.provenance ?? 'MISSING'}; ตรวจไฟล์จริงและ continuity ทุกครั้ง`, '',
    ]),
  ].join('\n');
}

export function prepareProductionAcceptance({ workspace = process.cwd(), inputPath, outputDir }) {
  const root = resolve(workspace);
  const input = resolve(root, inputPath);
  const output = resolve(root, outputDir);
  assertOrdinaryPath(root);
  if (realpathSync(root) !== root || !inside(root, input) || !inside(root, output)) fail('UNSAFE_PATH');
  const privateRoot = join(root, '.tmp', 'production-acceptance');
  const name = relative(privateRoot, output);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(name)) fail('PRIVATE_OUTPUT_REQUIRED');
  assertOrdinaryPath(input); assertOrdinaryPath(output);
  if (realpathSync(input) !== input) fail('UNSAFE_PATH');
  try { lstatSync(output); fail('OUTPUT_ALREADY_EXISTS'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let descriptor;
  let bundle;
  try {
    descriptor = openSync(input, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.nlink !== 1 || info.size > MAX_INPUT_BYTES) fail('INVALID_INPUT_FILE');
    let value;
    try { value = JSON.parse(readFileSync(descriptor, 'utf8')); } catch { fail('INVALID_INPUT_FILE'); }
    bundle = buildProductionAcceptance(value);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  // All validation completes before making the new bundle. mkdir without recursive
  // and every write with wx preserve no-overwrite even if another writer wins a race.
  for (const path of [dirname(privateRoot), privateRoot]) {
    assertOrdinaryPath(path);
    try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST' || !lstatSync(path).isDirectory()) throw error; }
  }
  assertOrdinaryPath(output); mkdirSync(output, { mode: 0o700 });
  const write = (path, contents) => writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
  write(join(output, 'manifest.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  write(join(output, 'OWNER_HANDOFF_TH.md'), `${instructions(bundle)}\n`);
  const prompts = join(output, 'scenes'); mkdirSync(prompts, { mode: 0o700 });
  for (const scene of bundle.scenes) write(join(prompts, `scene_${scene.order}.txt`), `${scene.promptEn}\n`);
  return { sceneCount: bundle.scenes.length, durationSeconds: bundle.project.targetDurationSeconds, missingClipCount: bundle.missingClips.length, textProvenance: bundle.provenance.text };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') fail('USAGE: node --import tsx scripts/prepare-production-acceptance.mjs --input <private-snapshot.json> --output .tmp/production-acceptance/<new-name>');
    const summary = prepareProductionAcceptance({ inputPath: args[1], outputDir: args[3] });
    console.log(JSON.stringify(summary));
  } catch {
    // Neither Zod diagnostics, paths, story content, nor private input are logged.
    console.error('Offline handoff failed. Check private input, workspace paths, permissions, and unused output directory. Usage: node --import tsx scripts/prepare-production-acceptance.mjs --input <private-snapshot.json> --output .tmp/production-acceptance/<new-name>');
    process.exitCode = 1;
  }
}
