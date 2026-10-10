import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Internal launcher for gemini-local.ps1. Importing is inert; no provider request.
const model = 'gemini-3.5-flash-lite';
const essential = ['SystemRoot', 'SystemDrive', 'WINDIR', 'TEMP', 'TMP', 'PATH', 'PATHEXT', 'LOCALAPPDATA', 'APPDATA'];
const safeCodes = new Set(['BUILD_REQUIRED', 'PRIVATE_PATH_UNSAFE', 'OWNER_PORT_ALREADY_SERVING', 'GEMINI_NOT_READY']);

function safePath(path) {
  for (let current = resolve(path);;) {
    let entry;
    try { entry = lstatSync(current); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    if (entry && (entry.isSymbolicLink() || realpathSync(current).toLowerCase() !== current.toLowerCase())) throw new Error('PRIVATE_PATH_UNSAFE');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function startGeminiLocal(root, input = process.env) {
  const port = Number(input.ACF_PORT ?? 3013);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || input.ACF_GEMINI_FREE_TIER_CONFIRMED !== 'true' ||
      !input.GEMINI_API_KEY || input.GEMINI_API_KEY.length < 16 || input.GEMINI_API_KEY.length > 4096 || /\s/.test(input.GEMINI_API_KEY)) throw new Error('GEMINI_NOT_READY');
  const privateDir = join(root, '.tmp', 'gemini-private');
  const storage = join(root, 'storage');
  for (const path of [privateDir, storage, join(root, 'dist', 'api', 'server', 'index.js')]) safePath(path);
  if (!existsSync(privateDir) || !existsSync(join(root, 'dist', 'api', 'server', 'index.js'))) throw new Error('BUILD_REQUIRED');
  // Fail before creating storage/process if another application owns this port.
  const reservation = createServer();
  await new Promise((accept, reject) => {
    reservation.once('error', () => reject(new Error('OWNER_PORT_ALREADY_SERVING')));
    reservation.listen({ host: '127.0.0.1', port, exclusive: true }, accept);
  });
  await new Promise((accept, reject) => reservation.close(error => error ? reject(new Error('STARTUP_FAILED')) : accept()));
  mkdirSync(storage, { recursive: true });
  safePath(storage);
  const dataDirectory = mkdtempSync(join(storage, 'gemini-canary-'));
  safePath(dataDirectory);
  const runId = randomUUID();
  const stdout = openSync(join(privateDir, `${runId}.stdout.log`), 'wx', 0o600);
  const stderr = openSync(join(privateDir, `${runId}.stderr.log`), 'wx', 0o600);
  const env = Object.fromEntries(essential.filter(name => input[name] !== undefined).map(name => [name, input[name]]));
  Object.assign(env, {
    GEMINI_API_KEY: input.GEMINI_API_KEY, ACF_GEMINI_FREE_TIER_CONFIRMED: 'true',
    GEMINI_IDEAS_MODEL: model, GEMINI_EXPANSION_MODEL: model,
    ACF_OPENAI_REQUESTS_APPROVED: 'false', ACF_CLOUD_WORKER: 'false', ACF_AI_MODE: 'gemini',
    ACF_HOST: '127.0.0.1', ACF_PORT: String(port), ACF_DATA_DIR: dataDirectory,
    ACF_ALLOWED_ORIGINS: `http://127.0.0.1:${port},http://localhost:${port}`, ACF_SECURE_COOKIES: 'false',
  });
  let child;
  try {
    child = spawn(process.execPath, ['dist/api/server/index.js'], {
      cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr],
    });
    await new Promise((accept, reject) => { child.once('spawn', accept); child.once('error', reject); });
    const state = { spawned: true, pid: child.pid, port, startedAt: new Date().toISOString(), dataDirectory,
      model, generationStarted: false, billingChanged: false };
    writeFileSync(join(privateDir, `${runId}.process.json`), JSON.stringify(state, null, 2), { flag: 'wx', mode: 0o600 });
    child.unref();
    return state;
  } catch {
    // This object represents only the child just spawned here, never an existing server.
    if (child?.pid && child.exitCode === null) child.kill();
    throw new Error('STARTUP_FAILED');
  } finally {
    delete env.GEMINI_API_KEY;
    closeSync(stdout); closeSync(stderr);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await startGeminiLocal(resolve(dirname(fileURLToPath(import.meta.url)), '..')))); }
  catch (error) {
    console.log(JSON.stringify({ spawned: false, code: safeCodes.has(error?.message) ? error.message : 'STARTUP_FAILED' }));
    process.exitCode = 1;
  }
}
