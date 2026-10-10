import { execFile } from 'node:child_process';
import { extname, isAbsolute } from 'node:path';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { AppError } from './errors.js';

async function run(path: string, signal?: AbortSignal): Promise<string> {
  let release!: () => void;
  const closed = new Promise<void>(resolve => { release = resolve; });
  const result = new Promise<string>((resolve, reject) => {
    try {
      const child = execFile('ffprobe', ['-v','error','-protocol_whitelist','file,pipe','-show_entries','format=format_name:stream=codec_name,width,height','-of','json',path],
        { timeout: 10_000, maxBuffer: 32 * 1024, windowsHide: true, encoding: 'utf8', signal }, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.once('close', release);
    } catch (error) { release(); reject(error); }
  });
  // AbortError may arrive before process exit; wait for descriptor closure before
  // the upload handler removes the owned file (required on Windows).
  try { return await result; } finally { await closed; }
}
export async function probeImage(path: string, signal?: AbortSignal): Promise<{ width: number; height: number }> {
  try {
    if (signal?.aborted) throw new AppError('INTERRUPTED', 409);
    if (!isAbsolute(path) || !['.png','.jpg','.jpeg','.webp'].includes(extname(path).toLowerCase())) throw new Error();
    const info = await stat(path).catch(() => { throw new AppError('INVALID_MEDIA'); });
    if (signal?.aborted) throw new AppError('INTERRUPTED', 409);
    if (!info.isFile() || info.size < 1 || info.size > 16 * 1024 * 1024) throw new Error();
    const stdout = await run(path, signal);
    if (signal?.aborted) throw new AppError('INTERRUPTED', 409);
    const result = z.object({ format: z.object({ format_name: z.enum(['image2','jpeg_pipe','png_pipe','webp_pipe']) }), streams: z.array(z.object({ codec_name: z.enum(['png','mjpeg','webp']), width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) })).length(1) }).parse(JSON.parse(stdout));
    return { width: result.streams[0].width, height: result.streams[0].height };
  } catch (error) {
    if (signal?.aborted) throw new AppError('INTERRUPTED', 409);
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw new AppError('MEDIA_TOOL_MISSING', 500);
    throw new AppError('INVALID_MEDIA');
  }
}
