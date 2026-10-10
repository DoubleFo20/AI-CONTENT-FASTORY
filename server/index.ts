import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './app.js';
import { createConfiguredAiProvider } from './ai/router.js';
import { createDriveIntegrationFromEnv } from './storage/drive.js';
import { createSupabaseRepository } from './cloud/supabase.js';
import { shutdownApplication } from './shutdown.js';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = /[\\/]dist[\\/]api[\\/]server$/.test(here);
const production = process.env.NODE_ENV === 'production' || compiled;
const root = resolve(here, compiled ? '../../..' : '..');
const port = Number(process.env.ACF_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local server port.');
const host = process.env.ACF_HOST ?? '127.0.0.1';
const dataDir = resolve(root, process.env.ACF_DATA_DIR ?? 'storage');
const ai = createConfiguredAiProvider({ stateFile: join(dataDir, 'settings', 'ai-mode.json') });
const drive = createDriveIntegrationFromEnv(join(dataDir, 'drive'), { allowedFileRoots: ['clips','exports','audio','images'].map(kind => join(dataDir, kind)) });
const cloudRepository = createSupabaseRepository({ url: process.env.SUPABASE_URL, secretKey: process.env.SUPABASE_SECRET_KEY, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
const application = createApplication({
  dataDir,
  provider: ai.provider,
  integrations: { aiStatus: ai.status, setAiMode: ai.setMode, drive, cloudRepository },
  startCloudWorker: process.env.ACF_CLOUD_WORKER === 'true',
  allowedOrigins: process.env.ACF_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
  secureCookies: process.env.ACF_SECURE_COOKIES === 'true',
});
const web = resolve(root, 'dist/web');
if (production && existsSync(resolve(web, 'index.html'))) {
  application.app.use(express.static(web, { dotfiles: 'deny' }));
  application.app.get('/{*path}', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(resolve(web, 'index.html')); });
}
const server = application.app.listen(port, host, () => { console.log(`Local application listening on port ${port}.`); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try { await shutdownApplication(server, application); }
  catch { process.exitCode = 1; console.error('Local shutdown did not finish cleanly. Check worker and storage state before restarting.'); }
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
server.on('error', () => {
  process.exitCode = 1;
  console.error('Local server could not start. Check the configured port and host.');
  void shutdown();
});
