import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Exercises compiled startup/configuration without live AI or the actual owner database.
const root = await realpath(process.cwd());
await mkdir(resolve('.tmp'), { recursive: true });
const temporaryRoot = await realpath(resolve('.tmp'));
const childPath = relative(root, temporaryRoot);
if (childPath === '..' || childPath.startsWith(`..${sep}`) || isAbsolute(childPath)) throw new Error('Test directory outside workspace.');
const dataDir = await mkdtemp(join(temporaryRoot, 'compiled-core-'));
const reservation = createServer();
await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
const port = reservation.address().port;
await new Promise(resolveClose => reservation.close(resolveClose));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['dist/api/server/index.js'], {
  cwd: root, windowsHide: true, stdio: 'ignore',
  env: { ...process.env, ACF_DATA_DIR: dataDir, ACF_PORT: String(port), ACF_HOST: '127.0.0.1', ACF_ALLOWED_ORIGINS: origin,
    ACF_AI_MODE: 'mock', ACF_CLOUD_WORKER: 'false', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
    GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', ACF_SECURE_COOKIES: 'false' },
});
let cookie = ''; let csrf = '';
async function request(path, method = 'GET', body) {
  const headers = { ...(cookie ? { Cookie: cookie } : {}), ...(method === 'GET' ? {} : { Origin: origin, 'X-CSRF-Token': csrf }) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return globalThis.fetch(`${origin}/api${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function jobFinished(projectId) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const response = await request('/jobs'); assert.equal(response.status, 200);
    const { jobs } = await response.json();
    const latest = jobs.filter(job => job.projectId === projectId)[0];
    if (latest?.status === 'completed') return;
    if (latest?.status === 'failed') throw new Error('Mock smoke job failed.');
    await delay(100);
  }
  throw new Error('Mock smoke job deadline exceeded.');
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error('Compiled server exited during startup.');
    try { ready = (await globalThis.fetch(`${origin}/api/health`)).ok; } catch { /* Wait for the isolated child only. */ }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, 'Compiled server must start.');
  const setup = await request('/auth/setup', 'POST', { username: 'compiled_qa', password: 'synthetic-smoke-pass-2026' });
  assert.equal(setup.status, 201);
  cookie = setup.headers.get('set-cookie').split(';', 1)[0]; csrf = (await setup.json()).csrfToken;
  const capabilityResponse = await request('/integrations/capabilities');
  assert.equal(capabilityResponse.status, 200); assert.equal(capabilityResponse.headers.get('cache-control'), 'no-store');
  const { capabilities } = await capabilityResponse.json();
  assert.equal(capabilities.ai.active, 'mock'); assert.equal(capabilities.storage.state, 'not_configured');
  assert.equal(capabilities.structuredData.configured, false);
  const brief = { name: 'Compiled mock smoke', brief: 'A fictional traveler returns a lost notebook.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
  const created = await request('/projects', 'POST', brief); assert.equal(created.status, 201);
  const { project } = await created.json();
  assert.equal((await request(`/projects/${project.id}/ideas`, 'POST')).status, 202);
  await jobFinished(project.id);
  const withIdeas = (await (await request(`/projects/${project.id}`)).json()).project;
  assert.equal(withIdeas.ideas.length, 10);
  assert.ok(withIdeas.ideas.every(idea => idea.title.th.includes('MOCK') && idea.title.en.includes('MOCK')));
  const choice = withIdeas.ideas[6];
  assert.equal((await request(`/projects/${project.id}/select`, 'POST', { ideaId: choice.id })).status, 200);
  assert.equal((await request(`/projects/${project.id}/expand`, 'POST')).status, 202);
  await jobFinished(project.id);
  const expanded = (await (await request(`/projects/${project.id}`)).json()).project;
  assert.equal(expanded.selectedIdeaId, choice.id); assert.equal(expanded.package.scenes.length, 3);
  assert.ok(expanded.package.storyBible.en.includes(choice.title.en));
  assert.equal((await request(`/projects/${project.id}/prompt-pack`)).status, 200);
  assert.equal((await request('/auth/logout', 'POST')).status, 200);
  assert.equal((await request(`/projects/${project.id}`)).status, 401);
  console.log('Compiled core smoke passed: owner/session, mock ten ideas, selected expansion, capabilities, prompt pack and logout. No live provider or real owner data used.');
} catch (error) {
  console.error((error instanceof Error ? error.message : 'Compiled core smoke failed.').slice(0, 500));
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise(resolveExit => child.once('exit', resolveExit));
  }
  const target = await realpath(dataDir);
  if (!target.startsWith(`${temporaryRoot}${sep}`)) {
    console.error('Unsafe test cleanup target.'); process.exitCode = 1;
  } else await rm(target, { recursive: true, force: true });
}
