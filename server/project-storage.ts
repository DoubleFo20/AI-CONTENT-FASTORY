import { lstat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { Express, Response } from 'express';
import { z } from 'zod';
import type { Project } from '../shared/contracts.js';
import type { Store } from './store.js';
import type { ProjectFiles } from './project-files.js';
import { AppError } from './errors.js';
import { driveFailure } from './integrations.js';
import { managedPath } from './media.js';
import type { ManagedProjectMedia, ProjectStorage, ProjectStorageState } from './storage/projects.js';

const InputSchema = z.strictObject({ kind: z.enum(['clips', 'exports', 'audio', 'images']), mediaId: z.uuid() });
const mimeTypes: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// Both source and restored cache paths come exclusively from the owned catalog.
export function projectMedia(store: Store, files: ProjectFiles, ownerId: string, project: Project, kind: ManagedProjectMedia['kind'], mediaId: string): ManagedProjectMedia {
  z.uuid().parse(mediaId);
  let filePath: string; let name: string; let sceneId: string | undefined;
  if (kind === 'clips' || kind === 'exports') {
    const media = store.media(ownerId, mediaId, kind);
    if (media.projectId !== project.id) throw new AppError('NOT_FOUND', 404);
    filePath = managedPath(store.dataDir, kind, media.filename);
    sceneId = media.sceneId;
    name = `${sceneId ?? kind}__${mediaId}${extname(media.filename)}`;
  } else {
    const asset = kind === 'audio' ? files.audio(project, ownerId, mediaId) : files.image(project, ownerId, mediaId);
    filePath = join(store.dataDir, kind, asset.filename);
    name = asset.originalName;
  }
  const mimeType = mimeTypes[extname(filePath).toLowerCase()];
  if (!mimeType) throw new AppError('INVALID_MEDIA');
  return { id: mediaId, kind, filePath, name, mimeType, ...(sceneId ? { sceneId } : {}) };
}

function folderProject(project: Project) {
  const name = [...project.name].map(character => /[\\/]/.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? ' ' : character).join('').trim().slice(0, 120);
  return { id: project.id, name: name || 'Story project' };
}
export function emptyStorage(projectId: string): ProjectStorageState {
  return { projectId, prepared: false, folders: null, transfers: [], summary: { total: 0, active: 0, completed: 0, failed: 0 } };
}

export async function ensureCached(storage: ProjectStorage | null, ownerId: string, projectId: string, media: ManagedProjectMedia): Promise<void> {
  try {
    const info = await lstat(media.filePath);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new AppError('INVALID_MEDIA');
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!storage) throw new AppError('NOT_FOUND', 404);
  try { await storage.restore(ownerId, projectId, media.kind, media.id, media.filePath); }
  catch (error) { throw driveFailure(error); }
}

export function registerProjectStorage(app: Express, store: Store, files: ProjectFiles, storage: ProjectStorage | null): void {
  const owner = (res: Response) => String(res.locals.ownerId);
  const requireStorage = () => { if (!storage) throw new AppError('DRIVE_NOT_CONFIGURED', 409); return storage; };
  app.get('/api/projects/:id/storage', (req, res) => {
    const project = store.project(owner(res), z.uuid().parse(req.params.id));
    try { res.json({ storage: storage?.state(owner(res), project.id) ?? emptyStorage(project.id) }); }
    catch (error) { throw driveFailure(error); }
  });
  app.post('/api/projects/:id/storage/prepare', async (req, res) => {
    const project = store.project(owner(res), z.uuid().parse(req.params.id));
    z.strictObject({}).parse(req.body ?? {});
    try { res.json({ storage: await requireStorage().prepare(owner(res), folderProject(project)) }); }
    catch (error) { throw driveFailure(error); }
  });
  app.post('/api/projects/:id/storage/uploads', async (req, res) => {
    const project = store.project(owner(res), z.uuid().parse(req.params.id));
    const input = InputSchema.parse(req.body);
    const media = projectMedia(store, files, owner(res), project, input.kind, input.mediaId);
    try {
      const manager = requireStorage();
      if (!manager.state(owner(res), project.id).prepared) throw new AppError('CONFLICT', 409);
      res.status(202).json({ transfer: await manager.start(owner(res), folderProject(project), media) });
    } catch (error) { throw driveFailure(error); }
  });
}
