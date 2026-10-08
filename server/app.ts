import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { z } from 'zod';
import { AuthInputSchema, ProjectInputSchema } from '../shared/contracts.js';
import type { AiProvider } from './ai/types.js';
import { Store } from './store.js';
import { Worker } from './worker.js';
import { Auth, hashPassword, verifyPassword } from './auth.js';
import { AppError } from './errors.js';
import { managedPath, probeMedia } from './media.js';
import { registerDriveCallback, registerIntegrations, type IntegrationOptions } from './integrations.js';
import { CloudAiWorker } from './cloud/service.js';

export interface ApplicationOptions {
  dataDir: string;
  provider: AiProvider;
  allowedOrigins?: string[];
  secureCookies?: boolean;
  startWorker?: boolean;
  integrations?: IntegrationOptions;
  startCloudWorker?: boolean;
}
const defaultOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001'];
const EmptySchema = z.strictObject({});
const SelectionSchema = z.strictObject({ ideaId: z.string().min(1).max(64) });
const ClipFieldsSchema = z.strictObject({ sceneId: z.string().min(1).max(64) });
const id = (value: unknown): string => z.uuid().parse(value);
const empty = (req: Request) => EmptySchema.parse(req.body ?? {});

export function createApplication(options: ApplicationOptions) {
  const store = new Store(options.dataDir);
  const worker = new Worker(store, options.provider);
  const cloudWorker = options.integrations?.cloudRepository ? new CloudAiWorker(options.integrations.cloudRepository, options.provider) : null;
  const auth = new Auth(store, options.secureCookies ?? false);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  const origins = new Set(options.allowedOrigins ?? defaultOrigins);
  mkdirSync(join(store.dataDir, 'clips'), { recursive: true });
  mkdirSync(join(store.dataDir, 'exports'), { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: join(store.dataDir, 'clips'),
      filename: (_req, file, callback) => callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: 128 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 256, fieldNameSize: 64 },
    fileFilter: (_req, file, callback) => {
      const extension = extname(file.originalname).toLowerCase();
      if (!['.mp4', '.mov', '.webm'].includes(extension) || /[\\/]/.test(file.originalname) || [...file.originalname].some(character => character.charCodeAt(0) < 32) || file.originalname.length > 255) callback(new AppError('INVALID_MEDIA'));
      else callback(null, true);
    },
  });

  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      if (!origins.has(req.get('Origin') ?? '')) return next(new AppError('ORIGIN_FORBIDDEN', 403));
      const multipart = /^\/projects\/[^/]+\/clips\/?$/.test(req.path);
      const noInput = /^\/(auth\/logout|projects\/[^/]+\/(ideas|expand|export)|jobs\/[^/]+\/retry|integrations\/drive\/authorize|cloud\/projects\/[^/]+\/(ideas|expand|export|jobs\/[^/]+\/retry))\/?$/.test(req.path);
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
    const user = store.createOwner(input.username, await hashPassword(input.password));
    auth.loginSucceeded(req.socket.remoteAddress ?? 'unknown');
    res.status(201).json(auth.issue(res, user));
  });
  app.post('/api/auth/login', async (req, res) => {
    auth.throttle(req.socket.remoteAddress ?? 'unknown');
    const input = AuthInputSchema.parse(req.body);
    const account = store.credentials(input.username);
    if (!await verifyPassword(input.password, account?.passwordHash ?? null) || !account) throw new AppError('INVALID_CREDENTIALS', 401);
    auth.loginSucceeded(req.socket.remoteAddress ?? 'unknown');
    res.json(auth.issue(res, account.user));
  });
  registerDriveCallback(app, store, options.integrations ?? {});
  app.use('/api', (req, res, next) => {
    try {
      const session = auth.require(req);
      res.locals.ownerId = session.user.id;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) auth.csrf(req, session.csrfToken);
      next();
    } catch (error) { next(error); }
  });
  const owner = (res: Response) => String(res.locals.ownerId);
  registerIntegrations(app, store, auth, options.integrations ?? {});
  app.post('/api/auth/logout', (req, res) => { empty(req); auth.logout(req, res); res.json({ ok: true }); });
  app.get('/api/dashboard', (_req, res) => {
    const projects = store.listProjects(owner(res));
    res.json({ projectsCount: projects.length, completedCount: projects.filter(project => project.status === 'exported').length,
      activeJobsCount: store.listJobs(owner(res)).filter(job => ['queued', 'running'].includes(job.status)).length, recentProjects: projects.slice(0, 5) });
  });
  app.get('/api/projects', (_req, res) => res.json({ projects: store.listProjects(owner(res)) }));
  app.post('/api/projects', (req, res) => res.status(201).json({ project: store.createProject(owner(res), ProjectInputSchema.parse(req.body)) }));
  app.get('/api/projects/:id', (req, res) => res.json({ project: store.project(owner(res), id(req.params.id)) }));
  app.post('/api/projects/:id/ideas', (req, res) => { empty(req); res.status(202).json({ job: store.enqueue(owner(res), id(req.params.id), 'ideas') }); });
  app.post('/api/projects/:id/select', (req, res) => res.json({ project: store.select(owner(res), id(req.params.id), SelectionSchema.parse(req.body).ideaId) }));
  app.post('/api/projects/:id/expand', (req, res) => { empty(req); res.status(202).json({ job: store.enqueue(owner(res), id(req.params.id), 'expand') }); });
  app.get('/api/projects/:id/prompt-pack', (req, res) => {
    const project = store.project(owner(res), id(req.params.id));
    if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
    res.attachment(`prompt-pack-${project.id}.json`).json({ project: { id: project.id, name: project.name, aspectRatio: project.aspectRatio, selectedIdea: project.ideas.find(idea => idea.id === project.selectedIdeaId) }, ...project.package });
  });
  app.post('/api/projects/:id/clips', (req, res, next) => {
    try {
      const project = store.project(owner(res), id(req.params.id));
      store.assertIdle(project.id);
      if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
      upload.single('clip')(req, res, (error) => {
        void (async () => {
          try {
            if (error) throw error;
            const fields = ClipFieldsSchema.parse(req.body);
            if (!req.file) throw new AppError('INVALID_MEDIA');
            const media = await probeMedia(req.file.path);
            const clip = store.addClip(owner(res), project.id, fields.sceneId, req.file.filename, basename(req.file.originalname), media.duration);
            res.status(201).json({ clip });
          } catch (failure) {
            if (req.file) await rm(req.file.path, { force: true });
            next(failure);
          }
        })().catch(next);
      });
    } catch (error) { next(error); }
  });
  app.post('/api/projects/:id/export', (req, res) => { empty(req); res.status(202).json({ job: store.enqueue(owner(res), id(req.params.id), 'export') }); });
  app.get('/api/jobs', (_req, res) => res.json({ jobs: store.listJobs(owner(res)) }));
  app.post('/api/jobs/:id/retry', (req, res) => { empty(req); res.status(202).json({ job: store.retry(owner(res), id(req.params.id)) }); });
  for (const kind of ['clips', 'exports'] as const) {
    app.get(`/api/${kind}/:id/file`, (req, res, next) => {
      const media = store.media(owner(res), id(req.params.id), kind);
      managedPath(store.dataDir, kind, media.filename);
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
  return { app, store, worker, cloudWorker, async close(): Promise<void> { await cloudWorker?.stop(); await worker.stop(); store.close(); } };
}
