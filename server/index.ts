import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './app.js';
import { createOpenAiProvider } from './ai/provider.js';

const here = dirname(fileURLToPath(import.meta.url));
const compiled = /[\\/]dist[\\/]api[\\/]server$/.test(here);
const production = process.env.NODE_ENV === 'production' || compiled;
const root = resolve(here, compiled ? '../../..' : '..');
const port = Number(process.env.ACF_PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local server port.');
const host = process.env.ACF_HOST ?? '127.0.0.1';
const application = createApplication({
  dataDir: resolve(root, process.env.ACF_DATA_DIR ?? 'storage'),
  provider: createOpenAiProvider(),
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
  await new Promise<void>(resolve => { server.close(() => resolve()); });
  await application.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
server.on('error', () => {
  process.exitCode = 1;
  console.error('Local server could not start. Check the configured port and host.');
  void shutdown();
});
