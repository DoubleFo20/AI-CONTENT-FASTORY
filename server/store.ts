import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Clip, ExportArtifact, Idea, Job, JobType, Project, ProjectInput, ProjectSummary, StoryPackage, User, ErrorCode } from '../shared/contracts.js';
import { INITIAL_SCHEMA, SCHEMA_VERSION } from './schema.js';
import { AppError } from './errors.js';
import { AiUsageSchema, AiUsageReceiptSchema, type AiUsage, type AiUsageReceipt } from '../shared/ai.js';
import { estimateAiCost } from './ai/usage.js';

type Row = Record<string, string | number | null>;
const now = () => new Date().toISOString();
const parse = <T>(value: string | number | null): T => JSON.parse(String(value)) as T;
type GenerationSource = 'mock' | 'openai' | 'gemini';
type StoredInput = ProjectInput & { _generation?: ProjectSummary['generation']; _aiUsage?: AiUsageReceipt[] };
export interface StoreOptions { resumeQueuedMock?: boolean }

function openApplicationLock(path: string): number {
  const create = () => {
    const fd = openSync(path, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid })); return fd; }
    catch (error) { closeSync(fd); unlinkSync(path); throw error; }
  };
  try { return create(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  // Serialize stale-lock reclamation so simultaneous restarts cannot remove a new lock.
  // Unknown/corrupt markers fail closed; a live owner is never displaced.
  const recoveryPath = `${path}.recovery`;
  const recoveryFd = openSync(recoveryPath, 'wx', 0o600);
  try {
    const marker = JSON.parse(readFileSync(path, 'utf8')) as { pid?: unknown };
    if (typeof marker.pid !== 'number' || !Number.isInteger(marker.pid) || marker.pid <= 0) throw new Error('Invalid application lock.');
    try { process.kill(marker.pid, 0); throw new Error('Application is already running.'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    unlinkSync(path);
    return create();
  } finally { closeSync(recoveryFd); unlinkSync(recoveryPath); }
}

export class Store {
  readonly dataDir: string;
  private db!: DatabaseSync;
  private lockFd: number;
  private lockPath: string;
  private closed = false;

  constructor(dataDir: string, options: StoreOptions = {}) {
    this.dataDir = resolve(dataDir);
    mkdirSync(this.dataDir, { recursive: true });
    this.lockPath = join(this.dataDir, 'application.lock');
    this.lockFd = openApplicationLock(this.lockPath);
    try {
      this.db = new DatabaseSync(join(this.dataDir, 'factory.sqlite'));
      this.db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
      const actual = this.schemaSignature(this.db);
      if (actual.length === 0 && Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version) === 0) {
        this.db.exec('BEGIN IMMEDIATE');
        try { this.db.exec(INITIAL_SCHEMA); this.db.exec('COMMIT'); }
        catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
      const reference = new DatabaseSync(':memory:');
      reference.exec(INITIAL_SCHEMA);
      const expected = this.schemaSignature(reference);
      reference.close();
      if (Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version) !== SCHEMA_VERSION ||
          JSON.stringify(this.schemaSignature(this.db)) !== JSON.stringify(expected)) {
        throw new Error('Unsupported database schema; no automatic migration is allowed.');
      }
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.prepare("UPDATE jobs SET status='failed', error_code='INTERRUPTED', updated_at=? WHERE status='running'").run(now());
      // Pending paid requests require explicit retry after a restart. Mock replay is opt-in.
      if (!options.resumeQueuedMock) this.db.prepare("UPDATE jobs SET status='failed', error_code='INTERRUPTED', updated_at=? WHERE status='queued' AND type IN ('ideas','expand')").run(now());
    } catch (error) {
      this.db?.close();
      closeSync(this.lockFd);
      unlinkSync(this.lockPath);
      throw error;
    }
  }

  private schemaSignature(db: DatabaseSync) {
    return db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
    closeSync(this.lockFd);
    unlinkSync(this.lockPath);
  }

  transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  hasOwner(): boolean { return Boolean(this.db.prepare('SELECT 1 FROM users LIMIT 1').get()); }
  createOwner(username: string, passwordHash: string): User {
    return this.transaction(() => {
      if (this.hasOwner()) throw new AppError('ALREADY_CONFIGURED', 409);
      const user = { id: randomUUID(), username: username.trim().toLowerCase() };
      this.db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').run(user.id, user.username, passwordHash, now());
      return user;
    });
  }
  credentials(username: string): { user: User; passwordHash: string } | null {
    const row = this.db.prepare('SELECT id,username,password_hash FROM users WHERE username=?').get(username.trim().toLowerCase()) as Row | undefined;
    return row ? { user: { id: String(row.id), username: String(row.username) }, passwordHash: String(row.password_hash) } : null;
  }
  createSession(tokenHash: string, userId: string, csrf: string, expires: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(tokenHash, userId, csrf, expires);
  }
  session(tokenHash: string): { user: User; csrfToken: string } | null {
    const row = this.db.prepare('SELECT u.id,u.username,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(tokenHash, Date.now()) as Row | undefined;
    return row ? { user: { id: String(row.id), username: String(row.username) }, csrfToken: String(row.csrf_token) } : null;
  }
  revokeSession(tokenHash: string) { this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); }

  private summary(row: Row): ProjectSummary {
    const input = parse<StoredInput>(row.input_json);
    const generation: NonNullable<ProjectSummary['generation']> = {};
    for (const key of ['ideas', 'expansion'] as const) {
      const source = input._generation?.[key];
      if (source === 'mock' || source === 'openai' || source === 'gemini') generation[key] = source;
    }
    const aiUsage = (Array.isArray(input._aiUsage) ? input._aiUsage : []).slice(-50)
      .flatMap(value => { const parsed = AiUsageReceiptSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
    return { name: input.name, brief: input.brief, genre: input.genre, audience: input.audience, aspectRatio: input.aspectRatio,
      ...(input.targetDurationSeconds !== undefined ? { targetDurationSeconds: input.targetDurationSeconds } : {}),
      ...(Object.keys(generation).length ? { generation } : {}),
      ...(aiUsage.length ? { aiUsage } : {}),
      id: String(row.id), status: row.status as ProjectSummary['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  listProjects(ownerId: string): ProjectSummary[] {
    return (this.db.prepare('SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC,rowid DESC').all(ownerId) as Row[]).map(row => this.summary(row));
  }
  project(ownerId: string, projectId: string): Project {
    const row = this.db.prepare('SELECT * FROM projects WHERE id=? AND owner_id=?').get(projectId, ownerId) as Row | undefined;
    if (!row) throw new AppError('NOT_FOUND', 404);
    const clips = this.db.prepare('SELECT * FROM clips WHERE project_id=? ORDER BY created_at DESC,rowid DESC').all(projectId) as Row[];
    const latest = new Map<string, Clip>();
    for (const clip of clips) if (!latest.has(String(clip.scene_id))) latest.set(String(clip.scene_id), this.clip(clip));
    const output = this.db.prepare('SELECT * FROM exports WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(projectId) as Row | undefined;
    return { ...this.summary(row), ideas: parse<Idea[]>(row.ideas_json), selectedIdeaId: row.selected_idea_id as string | null,
      package: row.package_json ? parse<StoryPackage>(row.package_json) : null, clips: [...latest.values()], export: output ? this.exportArtifact(output) : null };
  }
  createProject(ownerId: string, input: ProjectInput): Project {
    const id = randomUUID(); const timestamp = now();
    this.db.prepare('INSERT INTO projects(id,owner_id,input_json,created_at,updated_at) VALUES(?,?,?,?,?)').run(id, ownerId, JSON.stringify(input), timestamp, timestamp);
    return this.project(ownerId, id);
  }
  assertIdle(projectId: string) {
    if (this.db.prepare("SELECT 1 FROM jobs WHERE project_id=? AND status IN ('queued','running')").get(projectId)) throw new AppError('CONFLICT', 409);
  }
  select(ownerId: string, projectId: string, ideaId: string): Project {
    return this.transaction(() => {
      const project = this.project(ownerId, projectId); this.assertIdle(projectId);
      if (project.package) throw new AppError('CONFLICT', 409);
      if (project.ideas.length !== 10) throw new AppError('IDEAS_REQUIRED', 409);
      if (!project.ideas.some(idea => idea.id === ideaId)) throw new AppError('INVALID_SELECTION');
      this.db.prepare("UPDATE projects SET selected_idea_id=?,status='selected',updated_at=? WHERE id=?").run(ideaId, now(), projectId);
      return this.project(ownerId, projectId);
    });
  }
  prerequisites(project: Project, type: JobType) {
    if (type === 'ideas' && (project.ideas.length === 10 || project.selectedIdeaId || project.package)) throw new AppError('CONFLICT', 409);
    if (type === 'expand') {
      if (project.package) throw new AppError('CONFLICT', 409);
      if (!project.selectedIdeaId || !project.ideas.some(idea => idea.id === project.selectedIdeaId)) throw new AppError('SELECTION_REQUIRED', 409);
    }
    if (type === 'export') {
      if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
      if (project.package.scenes.some(scene => !project.clips.some(clip => clip.sceneId === scene.id))) throw new AppError('CLIPS_REQUIRED', 409);
    }
  }
  enqueue(ownerId: string, projectId: string, type: JobType): Job {
    return this.transaction(() => {
      const project = this.project(ownerId, projectId); this.assertIdle(projectId); this.prerequisites(project, type);
      const id = randomUUID(); const timestamp = now();
      this.db.prepare("INSERT INTO jobs(id,project_id,owner_id,type,status,created_at,updated_at) VALUES(?,?,?,?,'queued',?,?)").run(id, projectId, ownerId, type, timestamp, timestamp);
      return this.job(ownerId, id);
    });
  }
  private jobRow(row: Row): Job {
    return { id: String(row.id), projectId: String(row.project_id), projectName: parse<ProjectInput>(row.input_json).name, type: row.type as JobType,
      status: row.status as Job['status'], progress: Number(row.progress), errorCode: row.error_code as string | null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
  }
  listJobs(ownerId: string): Job[] {
    return (this.db.prepare('SELECT j.*,p.input_json FROM jobs j JOIN projects p ON p.id=j.project_id WHERE j.owner_id=? AND p.owner_id=? ORDER BY j.created_at DESC,j.rowid DESC').all(ownerId, ownerId) as Row[]).map(row => this.jobRow(row));
  }
  job(ownerId: string, id: string): Job {
    const result = this.listJobs(ownerId).find(job => job.id === id);
    if (!result) throw new AppError('NOT_FOUND', 404);
    return result;
  }
  retry(ownerId: string, id: string): Job {
    const job = this.job(ownerId, id);
    if (job.status !== 'failed') throw new AppError('CONFLICT', 409);
    return this.enqueue(ownerId, job.projectId, job.type);
  }
  cancel(ownerId: string, id: string): Job {
    return this.transaction(() => {
      const job = this.job(ownerId, id);
      if (job.status === 'failed' && job.errorCode === 'JOB_CANCELLED') return job;
      if (job.status !== 'queued' && job.status !== 'running') throw new AppError('CONFLICT', 409);
      this.db.prepare("UPDATE jobs SET status='failed',error_code='JOB_CANCELLED',updated_at=? WHERE id=? AND owner_id=? AND status IN ('queued','running')").run(now(), id, ownerId);
      return this.job(ownerId, id);
    });
  }
  updateProgress(id: string, progress: number): boolean {
    if (!Number.isInteger(progress) || progress < 0 || progress >= 100) throw new AppError('INVALID_INPUT');
    return this.db.prepare("UPDATE jobs SET progress=?,updated_at=? WHERE id=? AND status='running' AND progress<?").run(progress, now(), id, progress).changes > 0;
  }
  claim(excludedProjectIds: readonly string[] = []): { job: Job; ownerId: string } | null {
    return this.transaction(() => {
      const exclusion = excludedProjectIds.length ? ` AND j.project_id NOT IN (${excludedProjectIds.map(() => '?').join(',')})` : '';
      const row = this.db.prepare(`SELECT j.*,p.input_json FROM jobs j JOIN projects p ON p.id=j.project_id WHERE j.status='queued'${exclusion} ORDER BY j.created_at,j.rowid LIMIT 1`).get(...excludedProjectIds) as Row | undefined;
      if (!row) return null;
      this.db.prepare("UPDATE jobs SET status='running',progress=5,updated_at=? WHERE id=? AND status='queued'").run(now(), String(row.id));
      return { job: this.job(String(row.owner_id), String(row.id)), ownerId: String(row.owner_id) };
    });
  }
  completeIdeas(job: Job, ideas: Idea[], source?: GenerationSource): boolean {
    return this.transaction(() => {
      if (!this.completeJob(job)) return false;
      this.db.prepare("UPDATE projects SET ideas_json=?,status='ideas_ready',updated_at=? WHERE id=?").run(JSON.stringify(ideas), now(), job.projectId);
      this.recordGeneration(job.projectId, 'ideas', source);
      return true;
    });
  }
  completePackage(job: Job, story: StoryPackage, source?: GenerationSource): boolean {
    return this.transaction(() => {
      if (!this.completeJob(job)) return false;
      this.db.prepare("UPDATE projects SET package_json=?,status='expanded',updated_at=? WHERE id=?").run(JSON.stringify(story), now(), job.projectId);
      this.recordGeneration(job.projectId, 'expansion', source);
      return true;
    });
  }
  private recordGeneration(projectId: string, key: 'ideas' | 'expansion', source?: GenerationSource) {
    if (!source) return;
    const row = this.db.prepare('SELECT input_json FROM projects WHERE id=?').get(projectId) as Row;
    const input = parse<StoredInput>(row.input_json);
    input._generation = { ...input._generation, [key]: source };
    this.db.prepare('UPDATE projects SET input_json=? WHERE id=?').run(JSON.stringify(input), projectId);
  }
  recordAiUsage(ownerId: string, job: Job, value: AiUsage): boolean {
    const parsed = AiUsageSchema.safeParse(value);
    if (!parsed.success || parsed.data.operation !== job.type) return false;
    return this.transaction(() => {
      const row = this.db.prepare("SELECT p.input_json FROM projects p JOIN jobs j ON j.project_id=p.id WHERE p.id=? AND p.owner_id=? AND j.id=? AND j.owner_id=? AND j.type=? AND j.status='running'")
        .get(job.projectId, ownerId, job.id, ownerId, job.type) as Row | undefined;
      if (!row) return false;
      const input = parse<StoredInput>(row.input_json);
      const previous = Array.isArray(input._aiUsage) ? input._aiUsage : [];
      if (previous.some(receipt => receipt.jobId === job.id)) return false;
      const receipt = AiUsageReceiptSchema.parse({ ...parsed.data, jobId: job.id, recordedAt: now(), ...estimateAiCost(parsed.data) });
      input._aiUsage = [...previous, receipt].slice(-50);
      this.db.prepare('UPDATE projects SET input_json=? WHERE id=? AND owner_id=?').run(JSON.stringify(input), job.projectId, ownerId);
      return true;
    });
  }
  private completeJob(job: Job): boolean {
    return this.db.prepare("UPDATE jobs SET status='completed',progress=100,error_code=NULL,updated_at=? WHERE id=? AND project_id=? AND type=? AND status='running'").run(now(), job.id, job.projectId, job.type).changes > 0;
  }
  failJob(id: string, code: ErrorCode): boolean {
    return this.db.prepare("UPDATE jobs SET status='failed',error_code=?,updated_at=? WHERE id=? AND status IN ('queued','running')").run(code, now(), id).changes > 0;
  }
  private clip(row: Row): Clip {
    return { id: String(row.id), projectId: String(row.project_id), sceneId: String(row.scene_id), originalName: String(row.original_name), durationSeconds: Number(row.duration_seconds), createdAt: String(row.created_at) };
  }
  private exportArtifact(row: Row): ExportArtifact {
    return { id: String(row.id), projectId: String(row.project_id), aspectRatio: row.aspect_ratio as ExportArtifact['aspectRatio'], createdAt: String(row.created_at) };
  }
  addClip(ownerId: string, projectId: string, sceneId: string, filename: string, originalName: string, duration: number): Clip {
    return this.transaction(() => {
      const project = this.project(ownerId, projectId); this.assertIdle(projectId);
      if (!project.package) throw new AppError('PACKAGE_REQUIRED', 409);
      if (!project.package.scenes.some(scene => scene.id === sceneId)) throw new AppError('INVALID_INPUT');
      const id = randomUUID();
      this.db.prepare('INSERT INTO clips VALUES(?,?,?,?,?,?,?)').run(id, projectId, sceneId, filename, originalName, duration, now());
      const updated = this.project(ownerId, projectId);
      const ready = updated.package!.scenes.every(scene => updated.clips.some(clip => clip.sceneId === scene.id));
      // Importing a replacement clip invalidates the previously assembled export.
      this.db.prepare('DELETE FROM exports WHERE project_id=?').run(projectId);
      this.db.prepare('UPDATE projects SET status=?,updated_at=? WHERE id=?').run(ready ? 'clips_ready' : 'expanded', now(), projectId);
      return this.clip(this.db.prepare('SELECT * FROM clips WHERE id=?').get(id) as Row);
    });
  }
  completeExport(job: Job, filename: string, ratio: ExportArtifact['aspectRatio']): boolean {
    return this.transaction(() => {
      if (!this.completeJob(job)) return false;
      this.db.prepare('INSERT INTO exports VALUES(?,?,?,?,?)').run(randomUUID(), job.projectId, filename, ratio, now());
      this.db.prepare("UPDATE projects SET status='exported',updated_at=? WHERE id=?").run(now(), job.projectId);
      return true;
    });
  }
  media(ownerId: string, id: string, kind: 'clips' | 'exports'): { filename: string; projectId: string; originalName?: string; sceneId?: string } {
    const row = this.db.prepare(`SELECT m.* FROM ${kind} m JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.owner_id=?`).get(id, ownerId) as Row | undefined;
    if (!row) throw new AppError('NOT_FOUND', 404);
    return { filename: String(row.internal_filename), projectId: String(row.project_id), ...(kind === 'clips' ? { originalName: String(row.original_name), sceneId: String(row.scene_id) } : {}) };
  }
}
