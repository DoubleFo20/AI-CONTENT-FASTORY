import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { Project } from '../shared/contracts.js';
import { EditorSettingsSchema, type EditorSettings } from '../shared/production.js';
import { AppError } from './errors.js';
import type { Store } from './store.js';

const ProbeSchema = z.object({
  format: z.object({ duration: z.string().optional() }),
  streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })),
});

// Child stderr is discarded, so private paths and embedded metadata cannot reach API/logs.
// Capture is bounded; no shell or user-supplied command fragments are used.
function execute(command: string, args: string[], timeoutMs: number, signal?: AbortSignal, cwd?: string): Promise<string> {
  if (signal?.aborted) return Promise.reject(new AppError('INTERRUPTED', 409));
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; let bytes = 0; let settled = false; let failure: AppError | undefined;
    const finish = (error?: AppError) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(output);
    };
    const abort = () => { failure = new AppError('INTERRUPTED', 409); child.kill(); };
    const timer = setTimeout(() => { failure = new AppError('EXPORT_FAILED', 500); child.kill(); }, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) { failure = new AppError('INVALID_MEDIA'); child.kill(); }
      else output += chunk.toString('utf8');
    });
    child.on('error', (error: NodeJS.ErrnoException) => finish(new AppError(error.code === 'ENOENT' ? 'MEDIA_TOOL_MISSING' : 'EXPORT_FAILED', 500)));
    child.on('close', (code) => finish(failure ?? (code === 0 ? undefined : new AppError('EXPORT_FAILED', 500))));
  });
}

export async function probeMedia(path: string, signal?: AbortSignal): Promise<{ duration: number; hasAudio: boolean }> {
  let raw: string;
  try {
    raw = await execute('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path], 30_000, signal);
  } catch (error) {
    if (error instanceof AppError && ['MEDIA_TOOL_MISSING', 'INTERRUPTED'].includes(error.code)) throw error;
    throw new AppError('INVALID_MEDIA');
  }
  try {
    const info = ProbeSchema.parse(JSON.parse(raw));
    const duration = Number(info.format.duration);
    const video = info.streams.find(stream => stream.codec_type === 'video');
    if (!video || !video.width || !video.height || video.width > 8192 || video.height > 8192 || !Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error();
    return { duration, hasAudio: info.streams.some(stream => stream.codec_type === 'audio') };
  } catch { throw new AppError('INVALID_MEDIA'); }
}

export function managedPath(dataDir: string, kind: 'clips' | 'exports', filename: string): string {
  if (!/^[0-9a-f-]{36}\.(mp4|mov|webm)$/.test(filename)) throw new AppError('NOT_FOUND', 404);
  return join(dataDir, kind, filename);
}

// Callers resolve ownership and managed storage before supplying any audio path.
export async function probeAudio(path: string, signal?: AbortSignal): Promise<{ duration: number }> {
  try {
    if (!isAbsolute(path) || !['.mp3', '.m4a', '.wav', '.ogg'].includes(extname(path).toLowerCase())) throw new Error();
    const file = await stat(path);
    if (!file.isFile() || file.size === 0 || file.size > 100 * 1024 * 1024) throw new Error();
    const raw = await execute('ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,sample_rate,channels', '-of', 'json', path], 30_000, signal);
    const info = z.object({
      format: z.object({ duration: z.string() }),
      streams: z.array(z.object({ codec_type: z.string(), sample_rate: z.string().optional(), channels: z.number().optional() })),
    }).parse(JSON.parse(raw));
    const duration = Number(info.format.duration);
    const audio = info.streams.filter(stream => stream.codec_type === 'audio');
    if (!audio.length || info.streams.some(stream => stream.codec_type === 'video') ||
        audio.some(stream => !stream.channels || stream.channels > 8 || !Number.isFinite(Number(stream.sample_rate)) || Number(stream.sample_rate) <= 0 || Number(stream.sample_rate) > 192000) ||
        !Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new Error();
    return { duration };
  } catch (error) {
    if (error instanceof AppError && ['MEDIA_TOOL_MISSING', 'INTERRUPTED'].includes(error.code)) throw error;
    throw new AppError('INVALID_MEDIA');
  }
}

export interface ExportOptions {
  settings: EditorSettings;
  music?: { path: string };
  effects?: Array<{ path: string; sceneId: string; volume: number }>;
  onProgress?: (fraction: number) => void;
}

function subtitleScript(text: string, width: number, height: number, duration: number): string {
  // ASS override syntax never comes from narration. Keep newlines as explicit line breaks.
  const printable = [...text].filter(character => {
    const code = character.charCodeAt(0);
    return (code >= 32 && code !== 127) || code === 9 || code === 10;
  }).join('');
  const safeText = printable.replace(/\\/g, '＼').replace(/\{/g, '（').replace(/\}/g, '）').replace(/\n/g, '\\N');
  const end = `${Math.floor(duration / 3600)}:${String(Math.floor(duration / 60) % 60).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}.00`;
  const size = Math.round(Math.min(width, height) * 0.045);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${process.platform === 'win32' ? 'Tahoma' : 'Noto Sans Thai'},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,40,40,${Math.round(height * 0.065)},1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,${end},Default,,0,0,0,,${safeText}\n`;
}

export async function assembleExport(store: Store, ownerId: string, project: Project, signal: AbortSignal, options?: ExportOptions): Promise<string> {
  if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
  const parsed = EditorSettingsSchema.safeParse(options?.settings ?? {});
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  const settings = parsed.data;
  const originalScenes = project.package.scenes;
  const ids = new Set(originalScenes.map(scene => scene.id));
  const order = settings.sceneOrder.length ? settings.sceneOrder : originalScenes.map(scene => scene.id);
  if (ids.size !== originalScenes.length || order.length !== ids.size || new Set(order).size !== ids.size || order.some(id => !ids.has(id))) throw new AppError('INVALID_INPUT');
  const scenes = order.map(id => originalScenes.find(scene => scene.id === id)!);
  const effects = options?.effects ?? [];
  if (Boolean(settings.musicAssetId) !== Boolean(options?.music) || effects.length !== settings.soundEffects.length ||
      effects.some((effect, index) => !ids.has(effect.sceneId) || effect.sceneId !== settings.soundEffects[index].sceneId || effect.volume !== settings.soundEffects[index].volume)) throw new AppError('INVALID_INPUT');
  if (options?.music) await probeAudio(options.music.path, signal);
  for (const effect of effects) await probeAudio(effect.path, signal);
  const planned = scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const outputName = `${randomUUID()}.mp4`;
  const output = managedPath(store.dataDir, 'exports', outputName);
  await mkdir(join(store.dataDir, 'exports'), { recursive: true });
  await mkdir(join(store.dataDir, 'tmp'), { recursive: true });
  const temp = await mkdtemp(join(store.dataDir, 'tmp', 'export-'));
  const shortSide = settings.resolution === '720p' ? 720 : 1080;
  const longSide = settings.resolution === '720p' ? 1280 : 1920;
  const [width, height] = project.aspectRatio === '9:16' ? [shortSide, longSide] : project.aspectRatio === '16:9' ? [longSide, shortSide] : [shortSide, shortSide];
  const crf = { draft: '28', standard: '23', high: '18' }[settings.quality];
  try {
    if (settings.subtitleLocale !== 'off' && process.platform === 'win32') {
      await mkdir(join(temp, 'fonts'));
      // Local font copy avoids drive-letter/filter escaping and supports Thai glyphs.
      await copyFile(join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', 'tahoma.ttf'), join(temp, 'fonts', 'tahoma.ttf'));
    }
    const segmentNames: string[] = [];
    for (const [index, scene] of scenes.entries()) {
      const clip = project.clips.find(candidate => candidate.sceneId === scene.id);
      if (!clip) throw new AppError('CLIPS_REQUIRED', 409);
      const input = managedPath(store.dataDir, 'clips', store.media(ownerId, clip.id, 'clips').filename);
      const probe = await probeMedia(input, signal);
      const filename = `segment-${index}.mp4`; // Package-local IDs are never used as file paths.
      segmentNames.push(filename);
      const duration = String(scene.durationSeconds);
      const args = ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', input];
      if (!probe.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      let videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS`;
      if (settings.subtitleLocale !== 'off') {
        const subtitles = `subtitles-${index}.ass`;
        await writeFile(join(temp, subtitles), subtitleScript(scene.narration[settings.subtitleLocale], width, height, scene.durationSeconds), { mode: 0o600 });
        videoFilter += `,subtitles=filename=${subtitles}${process.platform === 'win32' ? ':fontsdir=fonts' : ''}`;
      }
      // Fades consume existing scene time; no overlap or duration change.
      if (settings.transition === 'fade') videoFilter += `,fade=t=in:st=0:d=0.25,fade=t=out:st=${scene.durationSeconds - 0.25}:d=0.25`;
      const audioFilter = `${settings.normalizeAudio ? 'loudnorm=I=-16:LRA=11:TP=-1.5,' : ''}aresample=48000,aformat=channel_layouts=stereo,volume=${settings.clipVolume},apad`;
      args.push('-map', '0:v:0', '-map', probe.hasAudio ? '0:a:0' : '1:a:0',
        '-vf', videoFilter,
        '-af', audioFilter, '-t', duration, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-movflags', '+faststart', join(temp, filename));
      await execute('ffmpeg', args, 180_000, signal, temp);
      options?.onProgress?.((index + 1) / (scenes.length + 1));
    }
    const list = join(temp, 'segments.txt');
    await writeFile(list, segmentNames.map(name => `file '${name}'`).join('\n'), { mode: 0o600 });
    const args = ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', list];
    if (options?.music || effects.length) {
      const filters = ['[0:a]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS[clip]'];
      const labels = ['[clip]'];
      let inputIndex = 1;
      if (options?.music) {
        args.push('-stream_loop', '-1', '-protocol_whitelist', 'file,pipe', '-i', options.music.path);
        filters.push(`[${inputIndex++}:a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${settings.musicVolume},atrim=duration=${planned}[music]`);
        labels.push('[music]');
      }
      for (const [index, effect] of effects.entries()) {
        const sceneIndex = scenes.findIndex(scene => scene.id === effect.sceneId);
        const offset = scenes.slice(0, sceneIndex).reduce((sum, scene) => sum + scene.durationSeconds, 0);
        args.push('-protocol_whitelist', 'file,pipe', '-i', effect.path);
        filters.push(`[${inputIndex++}:a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,atrim=duration=${scenes[sceneIndex].durationSeconds},volume=${effect.volume},adelay=${offset * 1000}:all=1[effect${index}]`);
        labels.push(`[effect${index}]`);
      }
      filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=false:latency=true[audio]`);
      args.push('-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[audio]', '-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-t', String(planned));
    } else args.push('-c', 'copy');
    args.push('-movflags', '+faststart', output);
    await execute('ffmpeg', args, 180_000, signal);
    const result = await probeMedia(output, signal);
    if (Math.abs(result.duration - planned) > 1 || (await stat(output)).size === 0) throw new AppError('EXPORT_FAILED', 500);
    return outputName;
  } catch (error) {
    await rm(output, { force: true });
    if (error instanceof AppError) throw error;
    throw new AppError('EXPORT_FAILED', 500);
  } finally { await rm(temp, { recursive: true, force: true }); }
}
