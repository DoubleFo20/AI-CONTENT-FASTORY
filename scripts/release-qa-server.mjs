import express from 'express';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// An isolated browser acceptance harness. The quota error is injected: no paid AI request.
const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
if (!existsSync(join(root, 'dist', 'web', 'index.html'))) throw new Error('Build the release before QA.');
const port = Number(process.env.ACF_QA_PORT ?? 3004);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid QA port.');
await mkdir(join(root, '.tmp'), { recursive: true });
const temporaryRoot = await realpath(join(root, '.tmp')); const childPath = relative(root, temporaryRoot);
if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) throw new Error('QA directory outside release worktree.');
let dataDir;
if (process.env.ACF_QA_DATA_DIR) {
  dataDir = await realpath(resolve(root, process.env.ACF_QA_DATA_DIR));
  const child = relative(temporaryRoot, dataDir);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) throw new Error('QA resume directory outside the isolated temporary root.');
  if (await readFile(join(dataDir, 'QA_ONLY.txt'), 'utf8') !== 'Synthetic owner database, injected quota failure and Mock generation only. Not a live-provider test.\n') throw new Error('Only an existing synthetic QA database may be resumed.');
} else {
  dataDir = await mkdtemp(join(temporaryRoot, 'release-qa-'));
}
const { createApplication } = await import(pathToFileURL(join(root, 'dist/api/server/app.js')).href);
const { createConfiguredAiProvider } = await import(pathToFileURL(join(root, 'dist/api/server/ai/router.js')).href);
const { AiProviderError } = await import(pathToFileURL(join(root, 'dist/api/server/ai/provider.js')).href);
const { createMockProvider } = await import(pathToFileURL(join(root, 'dist/api/server/ai/mock.js')).href);
const { shutdownApplication } = await import(pathToFileURL(join(root, 'dist/api/server/shutdown.js')).href);
const ai = createConfiguredAiProvider({ mode: 'openai', apiKey: 'synthetic-qa-not-a-key', openai: { ...createMockProvider(), async generateIdeas() { throw new AiProviderError('AI_QUOTA_EXCEEDED'); } }, stateFile: join(dataDir, 'settings', 'ai-mode.json') });
const origin = `http://127.0.0.1:${port}`;
const application = createApplication({ dataDir, provider: ai.provider, allowedOrigins: [origin], integrations: { aiStatus: ai.status, setAiMode: ai.setMode } });
const web = join(root, 'dist', 'web'); application.app.use(express.static(web, { dotfiles: 'deny' }));
application.app.get('/{*path}', (_req, res) => { res.set('Cache-Control', 'no-cache'); res.sendFile(join(web, 'index.html')); });
await writeFile(join(dataDir, 'QA_ONLY.txt'), 'Synthetic owner database, injected quota failure and Mock generation only. Not a live-provider test.\n');
const server = application.app.listen(port, '127.0.0.1', () => { console.log(`Release QA: ${origin}; synthetic quota error + Mock; isolated database; no default login.`); });
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; try { await shutdownApplication(server, application); } catch { process.exitCode = 1; console.error('QA shutdown failed. Keep the isolated database for diagnosis.'); } }
process.once('SIGINT', () => { void shutdown(); }); process.once('SIGTERM', () => { void shutdown(); });
server.once('error', () => { process.exitCode = 1; console.error('QA server could not start.'); void shutdown(); });
