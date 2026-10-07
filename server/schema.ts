// Root-owned schema. Initialize only a new empty local database; never auto-migrate.
export const SCHEMA_VERSION = 1;
export const INITIAL_SCHEMA = `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  input_json TEXT NOT NULL,
  ideas_json TEXT NOT NULL DEFAULT '[]',
  selected_idea_id TEXT,
  package_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ideas_ready','selected','expanded','clips_ready','exported')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX projects_owner ON projects(owner_id, updated_at);
CREATE TABLE clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  scene_id TEXT NOT NULL,
  internal_filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  duration_seconds REAL NOT NULL CHECK(duration_seconds > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX clips_project ON clips(project_id, created_at);
CREATE TABLE exports (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  internal_filename TEXT NOT NULL UNIQUE,
  aspect_ratio TEXT NOT NULL CHECK(aspect_ratio IN ('9:16','16:9','1:1')),
  created_at TEXT NOT NULL
);
CREATE INDEX exports_project ON exports(project_id, created_at);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK(type IN ('ideas','expand','export')),
  status TEXT NOT NULL CHECK(status IN ('queued','running','completed','failed')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_owner ON jobs(owner_id, created_at);
CREATE UNIQUE INDEX jobs_active_project ON jobs(project_id) WHERE status IN ('queued','running');
PRAGMA user_version = 1;
`;
