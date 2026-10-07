import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Clip, ExportArtifact, Idea, Job, JobType, Project, ProjectInput, ProjectSummary, StoryPackage, User, ErrorCode } from '../shared/contracts.js';
import { INITIAL_SCHEMA, SCHEMA_VERSION } from './schema.js';
import { AppError } from './errors.js';

type Row = Record<string, string | number | null>;
const now = () => new Date().toISOString();
const parse = <T>(value: string | number | null): T => JSON.parse(String(value)) as T;

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

  constructor(dataDir: string) {
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
    return { ...parse<ProjectInput>(row.input_json), id: String(row.id), status: row.status as ProjectSummary['status'], createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
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
    if (type === 'ideas' && (project.selectedIdeaId || project.package)) throw new AppError('CONFLICT', 409);
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
  claim(): { job: Job; ownerId: string } | null {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT j.*,p.input_json FROM jobs j JOIN projects p ON p.id=j.project_id WHERE j.status='queued' ORDER BY j.created_at,j.rowid LIMIT 1").get() as Row | undefined;
      if (!row) return null;
      this.db.prepare("UPDATE jobs SET status='running',progress=5,updated_at=? WHERE id=? AND status='queued'").run(now(), String(row.id));
      return { job: this.job(String(row.owner_id), String(row.id)), ownerId: String(row.owner_id) };
    });
  }
  completeIdeas(job: Job, ideas: Idea[]) {
    this.transaction(() => {
      this.db.prepare("UPDATE projects SET ideas_json=?,status='ideas_ready',updated_at=? WHERE id=?").run(JSON.stringify(ideas), now(), job.projectId);
      this.completeJob(job.id);
    });
  }
  completePackage(job: Job, story: StoryPackage) {
    this.transaction(() => {
      this.db.prepare("UPDATE projects SET package_json=?,status='expanded',updated_at=? WHERE id=?").run(JSON.stringify(story), now(), job.projectId);
      this.completeJob(job.id);
    });
  }
  private completeJob(id: string) { this.db.prepare("UPDATE jobs SET status='completed',progress=100,error_code=NULL,updated_at=? WHERE id=?").run(now(), id); }
  failJob(id: string, code: ErrorCode) { this.db.prepare("UPDATE jobs SET status='failed',error_code=?,updated_at=? WHERE id=?").run(code, now(), id); }
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
  completeExport(job: Job, filename: string, ratio: ExportArtifact['aspectRatio']) {
    this.transaction(() => {
      this.db.prepare('INSERT INTO exports VALUES(?,?,?,?,?)').run(randomUUID(), job.projectId, filename, ratio, now());
      this.db.prepare("UPDATE projects SET status='exported',updated_at=? WHERE id=?").run(now(), job.projectId);
      this.completeJob(job.id);
    });
  }
  media(ownerId: string, id: string, kind: 'clips' | 'exports'): { filename: string; originalName?: string } {
    const row = this.db.prepare(`SELECT m.* FROM ${kind} m JOIN projects p ON p.id=m.project_id WHERE m.id=? AND p.owner_id=?`).get(id, ownerId) as Row | undefined;
    if (!row) throw new AppError('NOT_FOUND', 404);
    return { filename: String(row.internal_filename), ...(kind === 'clips' ? { originalName: String(row.original_name) } : {}) };
  }
}
