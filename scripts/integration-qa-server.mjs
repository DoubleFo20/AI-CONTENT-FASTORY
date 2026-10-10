import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Review the compiled application with an isolated owner database and no live providers.
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const entry = join(root, 'dist', 'api', 'server', 'index.js');
if (!existsSync(entry) || !existsSync(join(root, 'dist', 'web', 'index.html'))) {
  throw new Error('Build the integration worktree before starting its QA server.');
}
const port = Number(process.env.ACF_QA_PORT ?? 3004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid QA port.');
await mkdir(join(root, '.tmp'), { recursive: true });
const temporaryRoot = await realpath(join(root, '.tmp'));
const childPath = relative(root, temporaryRoot);
if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) {
  throw new Error('QA data directory outside integration worktree.');
}
const dataDir = await mkdtemp(join(temporaryRoot, 'integration-ui-'));
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env };
for (const key of ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI', 'GOOGLE_DRIVE_FOLDER_ID', 'ACF_TOKEN_ENCRYPTION_KEY',
  'ACF_DRIVE_ALLOWED_REDIRECT_URIS']) delete env[key];
Object.assign(env, {
  ACF_AI_MODE: 'mock', ACF_CLOUD_WORKER: 'false', ACF_PORT: String(port),
  ACF_HOST: '127.0.0.1', ACF_DATA_DIR: dataDir, ACF_ALLOWED_ORIGINS: origin,
  ACF_SECURE_COOKIES: 'false', NODE_ENV: 'production',
});
await writeFile(join(dataDir, 'QA_ONLY.txt'),
  'Synthetic integration review data only. No production credentials or real owner data.\n');
const child = spawn(process.execPath, [entry], { cwd: root, env, stdio: 'inherit', windowsHide: true });
console.log(`Integration QA: ${origin}; Mock AI; new isolated database; no default login.`);
console.log('Use a synthetic username/password. Close this server after the review.');
let stopping = false;
const stop = () => { if (!stopping) { stopping = true; child.kill('SIGTERM'); } };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
child.once('error', () => { console.error('Could not launch the integration QA server.'); process.exitCode = 1; });
child.once('exit', (code, signal) => {
  if (!stopping && (code !== 0 || signal)) process.exitCode = 1;
  console.log('Integration QA server stopped; synthetic data is retained under ignored .tmp.');
});
