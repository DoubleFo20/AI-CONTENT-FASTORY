import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { AuthInputSchema, ProjectInputSchema } from '../shared/contracts.js';
import { AiProviderError } from './ai/provider.js';
import type { AiProvider } from './ai/types.js';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { Auth, hashPassword, verifyPassword } from './auth.js';
import { AppError } from './errors.js';
import { probeMedia } from './media.js';
import { registerDriveCallback, registerIntegrations, type IntegrationOptions } from './integrations.js';
import { CloudAiWorker } from './cloud/service.js';
import { registerProduction } from './production.js';
import { ProjectFiles, flowPrompt } from './project-files.js';
import { ProjectStorage } from './storage/projects.js';
import { ensureCached, projectMedia, registerProjectStorage } from './project-storage.js';
import { RequestLifecycle } from './request-lifecycle.js';

export interface ApplicationOptions {
  dataDir: string;
  provider: AiProvider;
  allowedOrigins?: string[];
  secureCookies?: boolean;
  startWorker?: boolean;
  integrations?: IntegrationOptions;
  startCloudWorker?: boolean;
  requestDrainMs?: number;
}
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001'];
const EmptySchema = z.strictObject({});
const SelectionSchema = z.strictObject({ ideaId: z.string().min(1).max(64) });
const ClipFieldsSchema = z.strictObject({ sceneId: z.string().min(1).max(64) });
const id = (value: unknown): string => z.uuid().parse(value);
const empty = (req: Request) => EmptySchema.parse(req.body ?? {});

export function createApplication(options: ApplicationOptions) {
  const store = new Store(options.dataDir);
  const projectFiles = new ProjectFiles(store.dataDir);
  const projectStorage = options.integrations?.drive ? new ProjectStorage({ privateDir: join(store.dataDir, 'media-index'), drive: options.integrations.drive }) : null;
  const worker = new Worker(store, options.provider, {
    aiStatus: options.integrations?.aiStatus,
    prepareExport: async (ownerId, project, signal) => {
      const editor = projectFiles.state(project, ownerId).editor;
      const audioIds = new Set([...(editor.musicAssetId ? [editor.musicAssetId] : []), ...editor.soundEffects.map(effect => effect.assetId)]);
      const media = [...project.clips.map(clip => projectMedia(store, projectFiles, ownerId, project, 'clips', clip.id)), ...[...audioIds].map(id => projectMedia(store, projectFiles, ownerId, project, 'audio', id))];
      for (const item of media) { signal.throwIfAborted(); await ensureCached(projectStorage, ownerId, project.id, item); }
    },
  });
  const cloudWorker = options.integrations?.cloudRepository ? new CloudAiWorker(options.integrations.cloudRepository, options.provider) : null;
  const auth = new Auth(store, options.secureCookies ?? false);
  const lifecycle = new RequestLifecycle();
  const app = lifecycle.routes(express());
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  const origins = new Set(options.allowedOrigins ?? defaultOrigins);
  mkdirSync(join(store.dataDir, 'clips'), { recursive: true });
  mkdirSync(join(store.dataDir, 'exports'), { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: join(store.dataDir, 'clips'),
      filename: (_req, file, callback) => {
        try { lifecycle.guard(); callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`); }
        catch { callback(new AppError('INTERRUPTED', 503), ''); }
      },
    }),
    limits: { fileSize: 128 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 256, fieldNameSize: 64 },
    fileFilter: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      if (!['.mp4', '.mov', '.webm'].includes(extension) || /[\\/]/.test(file.originalname) || [...file.originalname].some(character => character.charCodeAt(0) < 32) || file.originalname.length > 255) callback(new AppError('INVALID_MEDIA'));
      else callback(null, true);
    },
  });

  app.use('/api', lifecycle.middleware);
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!origins.has(req.get('Origin') ?? '')) return next(new AppError('ORIGIN_FORBIDDEN', 403));
      const multipart = /^\/projects\/[^/]+\/(clips|audio|images)\/?$/.test(req.path);
      const noInput = /^\/(auth\/logout|projects\/[^/]+\/(ideas|expand|export)|jobs\/[^/]+\/(retry|cancel)|integrations\/drive\/authorize|cloud\/projects\/[^/]+\/(ideas|expand|export|jobs\/[^/]+\/retry))\/?$/.test(req.path);
      const emptyBody = !req.get('Transfer-Encoding') && Number(req.get('Content-Length') ?? 0) === 0;
      if (!(noInput && emptyBody) && !req.is(multipart ? 'multipart/form-data' : 'application/json')) return next(new AppError('INVALID_INPUT', 415));
    }
    next();
  });
  app.use('/api', express.json({ limit: '32kb', strict: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()) }));
  app.get('/api/auth/status', (req, res) => res.json(auth.state(req)));
  app.post('/api/auth/setup', async (req, res) => {
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) throw new AppError('SETUP_LOCAL_ONLY', 403);
    if (store.hasOwner()) throw new AppError('ALREADY_CONFIGURED', 409);
    auth.throttle(req.socket.remoteAddress ?? 'unknown');
    const input = AuthInputSchema.parse(req.body);
    const passwordHash = await lifecycle.race(hashPassword(input.password)); lifecycle.guard();
    const user = store.createOwner(input.username, passwordHash);
    auth.loginSucceeded(req.socket.remoteAddress ?? 'unknown');
    res.status(201).json(auth.issue(res, user));
  });
  app.post('/api/auth/login', async (req, res) => {
    auth.throttle(req.socket.remoteAddress ?? 'unknown');
    const input = AuthInputSchema.parse(req.body);
    const account = store.credentials(input.username);
    const valid = await lifecycle.race(verifyPassword(input.password, account?.passwordHash ?? null)); lifecycle.guard();
    if (!valid || !account) throw new AppError('INVALID_CREDENTIALS', 401);
    auth.loginSucceeded(req.socket.remoteAddress ?? 'unknown');
    res.json(auth.issue(res, account.user));
  });
  registerDriveCallback(app, store, options.integrations ?? {}, lifecycle);
  app.use('/api', (req, res, next) => {
    try {
      lifecycle.guard();
      const session = auth.require(req);
      res.locals.ownerId = session.user.id;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) auth.csrf(req, session.csrfToken);
      next();
    } catch (error) { next(error); }
  });
  const owner = (res: Response) => String(res.locals.ownerId);
  registerIntegrations(app, store, auth, options.integrations ?? {}, lifecycle);
  registerProduction(app, store, worker, projectFiles, projectStorage, lifecycle);
  registerProjectStorage(app, store, projectFiles, projectStorage);
  app.post('/api/integrations/ai/mode', (req, res) => {
    const input = z.strictObject({ mode: z.enum(['mock', 'openai']) }).parse(req.body);
    if (worker.hasOutstanding() || store.listJobs(owner(res)).some(job => job.status === 'queued' || job.status === 'running')) throw new AppError('CONFLICT', 409);
    if (!options.integrations?.setAiMode) throw new AppError('AI_NOT_CONFIGURED', 409);
    try { res.json({ ai: options.integrations.setAiMode(input.mode) }); }
    catch (error) { if (error instanceof AiProviderError) throw new AppError(error.code, 409); throw error; }
  });
  app.post('/api/auth/logout', (req, res) => { empty(req); auth.logout(req, res); res.json({ ok: true }); });
  app.get('/api/dashboard', (_req, res) => {
    const projects = store.listProjects(owner(res));
    res.json({ projectsCount: projects.length, completedCount: projects.filter(project => project.status === 'exported').length,
      activeJobsCount: store.listJobs(owner(res)).filter(job => ['queued', 'running'].includes(job.status)).length, recentProjects: projects.slice(0, 5) });
  });
  app.get('/api/projects', (_req, res) => res.json({ projects: store.listProjects(owner(res)) }));
  app.post('/api/projects', (req, res) => res.status(201).json({ project: store.createProject(owner(res), ProjectInputSchema.parse(req.body)) }));
  app.get('/api/projects/:id', (req, res) => res.json({ project: store.project(owner(res), id(req.params.id)) }));
  app.post('/api/projects/:id/ideas', (req, res) => { empty(req); const projectId = id(req.params.id); worker.assertAvailable(owner(res), projectId); res.status(202).json({ job: store.enqueue(owner(res), projectId, 'ideas') }); });
  app.post('/api/projects/:id/select', (req, res) => res.json({ project: store.select(owner(res), id(req.params.id), SelectionSchema.parse(req.body).ideaId) }));
  app.post('/api/projects/:id/expand', (req, res) => { empty(req); const projectId = id(req.params.id); worker.assertAvailable(owner(res), projectId); res.status(202).json({ job: store.enqueue(owner(res), projectId, 'expand') }); });
  app.get('/api/projects/:id/prompt-pack', (req, res) => {
    const project = store.project(owner(res), id(req.params.id));
    if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
    const state = projectFiles.state(project, owner(res));
    res.attachment(`prompt-pack-${project.id}.json`).json({ project: { id: project.id, name: project.name, aspectRatio: project.aspectRatio, generation: project.generation, selectedIdea: project.ideas.find(idea => idea.id === project.selectedIdeaId) }, ...project.package, scenes: project.package.scenes.map(scene => ({ ...scene, flowPromptEn: flowPrompt(project, scene, state) })) });
  });
  app.post('/api/projects/:id/clips', async (req, res) => {
    try {
      const project = store.project(owner(res), id(req.params.id));
      store.assertIdle(project.id);
      worker.assertAvailable(owner(res), project.id);
      if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
      await lifecycle.multipart(upload.single('clip'), req, res, async () => { if (req.file) await rm(req.file.path, { force: true }); });
      lifecycle.guard();
      const fields = ClipFieldsSchema.parse(req.body);
      if (!req.file) throw new AppError('INVALID_MEDIA');
      const media = await probeMedia(req.file.path, lifecycle.signal); lifecycle.guard();
      const clip = store.addClip(owner(res), project.id, fields.sceneId, req.file.filename, basename(req.file.originalname), media.duration);
      res.status(201).json({ clip });
    } catch (failure) {
      if (req.file) await rm(req.file.path, { force: true });
      throw lifecycle.signal.aborted ? new AppError('INTERRUPTED', 503) : failure;
    }
  });
  app.post('/api/projects/:id/export', (req, res) => { empty(req); const projectId = id(req.params.id); worker.assertAvailable(owner(res), projectId); res.status(202).json({ job: store.enqueue(owner(res), projectId, 'export') }); });
  app.get('/api/jobs', (_req, res) => res.json({ jobs: store.listJobs(owner(res)) }));
  app.get('/api/queue/status', (_req, res) => res.json({ worker: worker.status(owner(res)) }));
  app.post('/api/jobs/:id/cancel', (req, res) => { empty(req); res.json({ job: worker.cancel(owner(res), id(req.params.id)) }); });
  app.post('/api/jobs/:id/retry', (req, res) => { empty(req); const jobId = id(req.params.id); const job = store.job(owner(res), jobId); worker.assertAvailable(owner(res), job.projectId); res.status(202).json({ job: store.retry(owner(res), jobId) }); });
  for (const kind of ['clips', 'exports'] as const) {
    app.get(`/api/${kind}/:id/file`, async (req, res, next) => {
      const media = store.media(owner(res), id(req.params.id), kind);
      const project = store.project(owner(res), media.projectId);
      await ensureCached(projectStorage, owner(res), project.id, projectMedia(store, projectFiles, owner(res), project, kind, id(req.params.id)));
      lifecycle.guard();
      res.type(extname(media.filename));
      res.sendFile(media.filename, { root: join(store.dataDir, kind), cacheControl: false, lastModified: false, acceptRanges: true, dotfiles: 'deny' }, error => {
        if (error && !res.headersSent) next(new AppError('NOT_FOUND', 404));
      });
    });
  }
  app.use('/api', (_req, _res, next) => next(new AppError('NOT_FOUND', 404)));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (res.headersSent) { res.end(); return; }
    let failure = error instanceof AppError ? error : new AppError('INTERNAL_ERROR', 500);
    if (error instanceof z.ZodError || error instanceof SyntaxError) failure = new AppError('INVALID_INPUT');
    if (error instanceof multer.MulterError) failure = new AppError(error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_INPUT', error.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') failure = new AppError('INVALID_INPUT', 413);
    res.status(failure.status).json({ error: { code: failure.code } });
  });
  if (options.startWorker !== false) worker.start();
  if (options.startCloudWorker === true) cloudWorker?.start();
  let backgroundStop: Promise<void> | null = null;
  const stopBackground = () => {
    lifecycle.cancel();
    return backgroundStop ??= Promise.allSettled([cloudWorker?.stop(), worker.stop(), projectStorage?.stop()]).then(results => {
      if (results.some(result => result.status === 'rejected')) throw new AppError('WORKER_UNAVAILABLE', 500);
    });
  };
  let closing: Promise<void> | null = null;
  const close = () => closing ??= (async () => {
    try { await stopBackground(); }
    finally { try { await lifecycle.drain(options.requestDrainMs); } finally { store.close(); } }
  })();
  return { app, store, worker, cloudWorker, projectStorage, lifecycle, stopBackground, close };
}
