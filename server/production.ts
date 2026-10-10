import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { Express, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Store } from './store.js';
import type { Worker } from './worker.js';
import { AppError } from './errors.js';
import { probeAudio } from './media.js';
import { probeImage } from './images.js';
import { ProjectFiles, creditEstimate, flowPrompt, matchClip } from './project-files.js';
import type { ProjectStorage } from './storage/projects.js';
import { ensureCached, projectMedia } from './project-storage.js';
import { RequestLifecycle } from './request-lifecycle.js';

export function registerProduction(app: Express, store: Store, worker: Worker, files: ProjectFiles, storage: ProjectStorage | null = null, lifecycle = new RequestLifecycle()) {
  const owner = (res: Response) => String(res.locals.ownerId);
  const project = (res: Response, value: unknown) => store.project(owner(res), z.uuid().parse(value));
  app.get('/api/projects/:id/production', (req, res) => {
    const value = project(res, req.params.id); const state = files.state(value, owner(res));
    res.json({ state, estimate: creditEstimate(value, state), scenes: value.package?.scenes.map(scene => ({ id: scene.id, promptEn: flowPrompt(value, scene, state), imported: value.clips.some(clip => clip.sceneId === scene.id) })) ?? [] });
  });
  app.post('/api/projects/:id/production', (req, res) => {
    const value = project(res, req.params.id); store.assertIdle(value.id); worker.assertAvailable(owner(res), value.id);
    const state = files.update(value, owner(res), req.body);
    res.json({ state, estimate: creditEstimate(value, state) });
  });
  app.post('/api/projects/:id/clip-match', (req, res) => {
    const value = project(res, req.params.id);
    const input = z.strictObject({ filenames: z.array(z.string().min(1).max(255)).min(1).max(12) }).parse(req.body);
    res.json({ matches: input.filenames.map(filename => ({ filename, sceneId: matchClip(value, filename) })) });
  });
  mkdirSync(join(store.dataDir, 'audio'), { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({ destination: join(store.dataDir, 'audio'), filename: (_req, file, callback) => {
      try { lifecycle.guard(); callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`); }
      catch { callback(new AppError('INTERRUPTED', 503), ''); }
    } }),
    limits: { fileSize: 32 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => {
      if (!['.mp3', '.wav', '.m4a', '.ogg'].includes(extname(file.originalname).toLowerCase()) || /[\\/]/.test(file.originalname) || file.originalname.length > 255 || [...file.originalname].some(char => char.charCodeAt(0) < 32)) callback(new AppError('INVALID_MEDIA'));
      else callback(null, true);
    },
  });
  app.post('/api/projects/:id/audio', async (req, res) => {
    try {
      const value = project(res, req.params.id); store.assertIdle(value.id); worker.assertAvailable(owner(res), value.id);
      await lifecycle.multipart(upload.single('audio'), req, res, async () => { if (req.file) await rm(req.file.path, { force: true }); }); lifecycle.guard();
      if (!req.file) throw new AppError('INVALID_MEDIA');
      const info = await probeAudio(req.file.path, lifecycle.signal); lifecycle.guard();
      const asset = files.addAudio(value, owner(res), { id: randomUUID(), projectId: value.id, originalName: basename(req.file.originalname), durationSeconds: info.duration, createdAt: new Date().toISOString(), filename: req.file.filename });
      res.status(201).json({ asset });
    } catch (failure) { if (req.file) await rm(req.file.path, { force: true }); throw lifecycle.signal.aborted ? new AppError('INTERRUPTED', 503) : failure; }
  });
  app.get('/api/projects/:id/audio/:assetId/file', async (req, res) => {
    const value = project(res, req.params.id); const asset = files.audio(value, owner(res), z.uuid().parse(req.params.assetId));
    await ensureCached(storage, owner(res), value.id, projectMedia(store, files, owner(res), value, 'audio', asset.id));
    lifecycle.guard();
    res.type(extname(asset.filename)); res.sendFile(asset.filename, { root: join(store.dataDir, 'audio'), dotfiles: 'deny', cacheControl: false });
  });
  mkdirSync(join(store.dataDir, 'images'), { recursive: true });
  const imageUpload = multer({
    storage: multer.diskStorage({ destination: join(store.dataDir, 'images'), filename: (_req, file, callback) => {
      try { lifecycle.guard(); callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`); }
      catch { callback(new AppError('INTERRUPTED', 503), ''); }
    } }),
    limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => {
      if (!['.png','.jpg','.jpeg','.webp'].includes(extname(file.originalname).toLowerCase()) || /[\\/]/.test(file.originalname) || file.originalname.length > 255 || [...file.originalname].some(char => char.charCodeAt(0) < 32)) callback(new AppError('INVALID_MEDIA'));
      else callback(null, true);
    },
  });
  app.post('/api/projects/:id/images', async (req, res) => {
    try {
      const value = project(res, req.params.id); store.assertIdle(value.id); worker.assertAvailable(owner(res), value.id);
      await lifecycle.multipart(imageUpload.single('image'), req, res, async () => { if (req.file) await rm(req.file.path, { force: true }); }); lifecycle.guard();
      if (!req.file) throw new AppError('INVALID_MEDIA');
      const info = await probeImage(req.file.path, lifecycle.signal); lifecycle.guard();
      const asset = files.addImage(value, owner(res), { id: randomUUID(), projectId: value.id, originalName: basename(req.file.originalname), ...info, createdAt: new Date().toISOString(), filename: req.file.filename });
      res.status(201).json({ asset });
    } catch (failure) { if (req.file) await rm(req.file.path, { force: true }); throw lifecycle.signal.aborted ? new AppError('INTERRUPTED', 503) : failure; }
  });
  app.get('/api/projects/:id/images/:assetId/file', async (req, res) => {
    const value = project(res, req.params.id); const asset = files.image(value, owner(res), z.uuid().parse(req.params.assetId));
    await ensureCached(storage, owner(res), value.id, projectMedia(store, files, owner(res), value, 'images', asset.id));
    lifecycle.guard();
    res.type(extname(asset.filename)); res.sendFile(asset.filename, { root: join(store.dataDir, 'images'), dotfiles: 'deny', cacheControl: false });
  });
}
