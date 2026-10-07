import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { Project } from '../shared/contracts.js';
import { AppError } from './errors.js';
import type { Store } from './store.js';

const ProbeSchema = z.object({
  format: z.object({ duration: z.string().optional() }),
  streams: z.array(z.object({ codec_type: z.string(), width: z.number().optional(), height: z.number().optional() })),
});

// Child stderr is discarded, so private paths and embedded metadata cannot reach API/logs.
// Capture is bounded; no shell or user-supplied command fragments are used.
function execute(command: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
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

export async function assembleExport(store: Store, ownerId: string, project: Project, signal: AbortSignal): Promise<string> {
  if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
  const outputName = `${randomUUID()}.mp4`;
  const output = managedPath(store.dataDir, 'exports', outputName);
  await mkdir(join(store.dataDir, 'exports'), { recursive: true });
  await mkdir(join(store.dataDir, 'tmp'), { recursive: true });
  const temp = await mkdtemp(join(store.dataDir, 'tmp', 'export-'));
  const [width, height] = project.aspectRatio === '9:16' ? [1080, 1920] : project.aspectRatio === '16:9' ? [1920, 1080] : [1080, 1080];
  try {
    const segmentNames: string[] = [];
    for (const [index, scene] of project.package.scenes.entries()) {
      const clip = project.clips.find(candidate => candidate.sceneId === scene.id);
      if (!clip) throw new AppError('CLIPS_REQUIRED', 409);
      const input = managedPath(store.dataDir, 'clips', store.media(ownerId, clip.id, 'clips').filename);
      const probe = await probeMedia(input, signal);
      const filename = `segment-${index}.mp4`; // Package-local IDs are never used as file paths.
      segmentNames.push(filename);
      const duration = String(scene.durationSeconds);
      const args = ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', input];
      if (!probe.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      args.push('-map', '0:v:0', '-map', probe.hasAudio ? '0:a:0' : '1:a:0',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=${duration}`,
        '-af', 'aresample=48000,apad', '-t', duration, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-movflags', '+faststart', join(temp, filename));
      await execute('ffmpeg', args, 180_000, signal);
    }
    const list = join(temp, 'segments.txt');
    await writeFile(list, segmentNames.map(name => `file '${name}'`).join('\n'), { mode: 0o600 });
    await execute('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-f', 'concat', '-safe', '1', '-i', list, '-c', 'copy', '-movflags', '+faststart', output], 180_000, signal);
    const result = await probeMedia(output, signal);
    const planned = project.package.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
    if (Math.abs(result.duration - planned) > 1 || (await stat(output)).size === 0) throw new AppError('EXPORT_FAILED', 500);
    return outputName;
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally { await rm(temp, { recursive: true, force: true }); }
}
