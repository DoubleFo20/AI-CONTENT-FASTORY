import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import type { Express, Response } from 'express';
import { z } from 'zod';
import { ProjectInputSchema } from '../shared/contracts.js';
import type { AiRuntimeStatus, CloudJobInput, CloudProjectSnapshot, CloudRepository, RuntimeCapabilities } from '../shared/integrations.js';
import type { Auth } from './auth.js';
import type { Store } from './store.js';
import { AppError } from './errors.js';
import { managedPath } from './media.js';
import type { DriveIntegration } from './storage/types.js';
import { DriveError } from './storage/types.js';

export interface IntegrationOptions {
  aiStatus?: () => AiRuntimeStatus;
  drive?: DriveIntegration;
  cloudRepository?: CloudRepository | null;
}
const uuid = (value: unknown) => z.uuid().parse(value);
const owner = (res: Response) => String(res.locals.ownerId);
const EmptySchema = z.strictObject({});
const SelectionSchema = z.strictObject({ ideaId: z.string().min(1).max(64), revision: z.number().int().positive() });
const BackupSchema = z.strictObject({ kind: z.enum(['clips', 'exports']), mediaId: z.uuid() });
const CallbackSchema = z.object({
  state: z.string().min(32).max(256), code: z.string().min(1).max(4096).optional(), error: z.string().min(1).max(256).optional(),
}).refine(value => Boolean(value.code) !== Boolean(value.error));
const driveUnavailable = { provider: 'google_drive', configured: false, connected: false, state: 'not_configured' } as const;

export function driveFailure(error: unknown): AppError {
  if (!(error instanceof DriveError)) return error instanceof AppError ? error : new AppError('INTERNAL_ERROR', 500);
  switch (error.code) {
    case 'DRIVE_NOT_CONFIGURED': case 'DRIVE_NOT_CONNECTED': case 'DRIVE_AUTH_FAILED': case 'DRIVE_ACCESS_DENIED': return new AppError('CONFLICT', 409);
    case 'DRIVE_INVALID_INPUT': case 'DRIVE_STATE_INVALID': return new AppError('INVALID_INPUT');
    case 'DRIVE_NOT_FOUND': return new AppError('NOT_FOUND', 404);
    case 'DRIVE_RATE_LIMITED': return new AppError('RATE_LIMITED', 429);
    case 'DRIVE_TIMEOUT': return new AppError('INTERRUPTED', 504);
    case 'DRIVE_FILE_TOO_LARGE': return new AppError('FILE_TOO_LARGE', 413);
    default: return new AppError('INTERNAL_ERROR', 502);
  }
}
async function driveAction<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) { throw driveFailure(error); }
}

// Google redirects do not carry our SameSite=Strict cookie. The one-time OAuth state
// binds the original session hash; the adapter validates it before and after exchange.
export function registerDriveCallback(app: Express, store: Store, options: IntegrationOptions): void {
  app.get('/api/integrations/drive/callback', async (req, res) => {
    res.set('Referrer-Policy', 'no-referrer');
    const input = CallbackSchema.parse(req.query);
    if (!options.drive) throw new AppError('CONFLICT', 409);
    await driveAction(() => options.drive!.callback(input, (ownerId, sessionHash) => store.session(sessionHash)?.user.id === ownerId));
    res.redirect(303, '/');
  });
}

export function registerIntegrations(app: Express, store: Store, auth: Auth, options: IntegrationOptions): void {
  const repository = () => {
    if (!options.cloudRepository) throw new AppError('CONFLICT', 409);
    return options.cloudRepository;
  };
  const project = async (res: Response, projectId: string): Promise<CloudProjectSnapshot> => {
    const value = await repository().project(owner(res), projectId);
    if (!value) throw new AppError('NOT_FOUND', 404);
    return value;
  };
  const inputFor = (snapshot: CloudProjectSnapshot, type: CloudJobInput['type']): CloudJobInput => {
    if (type === 'ideas') return { type, brief: snapshot.brief };
    if (type === 'expand') {
      const selectedIdea = snapshot.ideas.find(idea => idea.id === snapshot.selectedIdeaId);
      if (!selectedIdea) throw new AppError('SELECTION_REQUIRED', 409);
      return { type, brief: snapshot.brief, selectedIdea };
    }
    if (!snapshot.package) throw new AppError('PACKAGE_REQUIRED', 409);
    return { type, aspectRatio: snapshot.brief.aspectRatio, sceneIds: snapshot.package.scenes.map(scene => scene.id) };
  };
  app.get('/api/integrations/capabilities', async (_req, res) => {
    const capabilities: RuntimeCapabilities = {
      ai: options.aiStatus?.() ?? { mode: 'openai', active: 'openai', fallbackReason: null },
      video: { primary: 'google_flow', integration: 'manual', supporting: 'meta_ai', supportingAvailable: false },
      storage: options.drive ? await driveAction(() => options.drive!.status(owner(res))) : driveUnavailable,
      structuredData: { active: 'sqlite', cloudTarget: 'supabase_postgres', configured: Boolean(options.cloudRepository) },
      execution: { active: 'local', cloudDeploymentVerified: false, localEditing: 'ffmpeg', remotionAvailable: false },
    };
    res.json({ capabilities });
  });
  app.get('/api/integrations/drive/status', async (_req, res) => {
    res.json({ storage: options.drive ? await driveAction(() => options.drive!.status(owner(res))) : driveUnavailable });
  });
  app.post('/api/integrations/drive/authorize', async (req, res) => {
    EmptySchema.parse(req.body ?? {});
    const token = auth.token(req);
    if (!token) throw new AppError('AUTH_REQUIRED', 401);
    if (!options.drive) throw new AppError('CONFLICT', 409);
    const sessionHash = createHash('sha256').update(token).digest('hex');
    res.json(await driveAction(() => options.drive!.begin(owner(res), sessionHash)));
  });
  const storageBusy = new Set<string>();
  async function exclusiveStorage<T>(ownerId: string, operation: () => Promise<T>): Promise<T> {
    if (storageBusy.has(ownerId)) throw new AppError('CONFLICT', 409);
    storageBusy.add(ownerId);
    try { return await driveAction(operation); } finally { storageBusy.delete(ownerId); }
  }
  app.post('/api/integrations/drive/backups', async (req, res) => {
    const input = BackupSchema.parse(req.body);
    const ownerId = owner(res);
    const media = store.media(ownerId, input.mediaId, input.kind);
    const filePath = managedPath(store.dataDir, input.kind, media.filename);
    if (!options.drive) throw new AppError('CONFLICT', 409);
    const extension = extname(media.filename).toLowerCase();
    const mimeType = extension === '.webm' ? 'video/webm' : extension === '.mov' ? 'video/quicktime' : 'video/mp4';
    const file = await exclusiveStorage(ownerId, () => options.drive!.upload(ownerId, { filePath, name: `${input.kind}-${input.mediaId}${extension}`, mimeType }));
    res.status(201).json({ file });
  });
  app.get('/api/integrations/drive/files/:id', async (req, res) => {
    const fileId = z.string().regex(/^[a-zA-Z0-9_-]{1,256}$/).parse(req.params.id);
    if (!options.drive) throw new AppError('CONFLICT', 409);
    const bytes = await exclusiveStorage(owner(res), () => options.drive!.download(owner(res), fileId));
    res.attachment(`drive-media-${fileId}`).type('application/octet-stream').send(Buffer.from(bytes));
  });
  app.get('/api/cloud/projects', async (_req, res) => res.json({ projects: await repository().projects(owner(res)) }));
  app.post('/api/cloud/projects', async (req, res) => {
    const snapshot: CloudProjectSnapshot = {
      id: randomUUID(), ownerId: owner(res), brief: ProjectInputSchema.parse(req.body),
      ideas: [], selectedIdeaId: null, package: null, revision: 1,
    };
    await repository().saveProject(owner(res), snapshot);
    res.status(201).json({ project: snapshot });
  });
  app.get('/api/cloud/projects/:id', async (req, res) => res.json({ project: await project(res, uuid(req.params.id)) }));
  app.post('/api/cloud/projects/:id/select', async (req, res) => {
    const input = SelectionSchema.parse(req.body);
    const snapshot = await project(res, uuid(req.params.id));
    if (snapshot.revision !== input.revision || snapshot.package) throw new AppError('CONFLICT', 409);
    if (snapshot.ideas.length !== 10) throw new AppError('IDEAS_REQUIRED', 409);
    if (!snapshot.ideas.some(idea => idea.id === input.ideaId)) throw new AppError('INVALID_SELECTION');
    const selected = { ...snapshot, selectedIdeaId: input.ideaId, revision: snapshot.revision + 1 };
    await repository().saveProject(owner(res), selected);
    res.json({ project: selected });
  });
  for (const type of ['ideas', 'expand', 'export'] as const) {
    app.post(`/api/cloud/projects/:id/${type}`, async (req, res) => {
      EmptySchema.parse(req.body ?? {});
      const snapshot = await project(res, uuid(req.params.id));
      if (type === 'export') throw new AppError('CLIPS_REQUIRED', 409);
      res.status(202).json({ job: await repository().enqueue(owner(res), snapshot.id, inputFor(snapshot, type)) });
    });
  }
  app.get('/api/cloud/projects/:id/jobs', async (req, res) => {
    const snapshot = await project(res, uuid(req.params.id));
    res.json({ jobs: await repository().jobs(owner(res), snapshot.id) });
  });
  app.post('/api/cloud/projects/:id/jobs/:jobId/retry', async (req, res) => {
    EmptySchema.parse(req.body ?? {});
    const snapshot = await project(res, uuid(req.params.id));
    const jobId = uuid(req.params.jobId);
    const failed = (await repository().jobs(owner(res), snapshot.id)).find(job => job.id === jobId);
    if (!failed) throw new AppError('NOT_FOUND', 404);
    if (failed.status !== 'failed') throw new AppError('CONFLICT', 409);
    if (failed.type === 'export') throw new AppError('CLIPS_REQUIRED', 409);
    res.status(202).json({ job: await repository().enqueue(owner(res), snapshot.id, inputFor(snapshot, failed.type)) });
  });
}
