import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

// Explicit operator command only. Importing this module is inert. No API key is read.
const model = 'gemini-3.5-flash-lite';
const marker = /^ACF GEMINI FREE TIER CANARY [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const codes = new Set(['INVALID_CONFIGURATION', 'FREE_TIER_CONFIRMATION_REQUIRED', 'AUTH_FAILED', 'GEMINI_NOT_READY',
  'INVALID_RESPONSE', 'REQUEST_FAILED', 'REQUEST_TIMEOUT', 'POLL_TIMEOUT', 'CANARY_STATE_UNSAFE', 'IDEAS_REQUEST_AMBIGUOUS',
  'CANARY_CREATE_AMBIGUOUS', 'IDEAS_INVALID', 'JOB_FAILED', 'QUOTA_STOP', 'ACCESS_STOP', 'LOGOUT_FAILED']);
export class GeminiVerificationError extends Error {
  constructor(code) { super(codes.has(code) ? code : 'REQUEST_FAILED'); this.name = 'GeminiVerificationError'; }
}
const fail = code => { throw new GeminiVerificationError(code); };

export function validateOrigin(origin, approvedHttpsOrigin) {
  try {
    const url = new URL(origin);
    if (origin !== url.origin || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('INVALID_CONFIGURATION');
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (!(url.protocol === 'http:' && loopback) && !(url.protocol === 'https:' && approvedHttpsOrigin === origin)) fail('INVALID_CONFIGURATION');
    return origin;
  } catch { fail('INVALID_CONFIGURATION'); }
}

function settings(options) {
  if (!options || typeof options !== 'object') fail('INVALID_CONFIGURATION');
  // Operator confirmation is separate from the backend's key/model/Free Tier gate.
  if (options.freeTierConfirmed !== true) fail('FREE_TIER_CONFIRMATION_REQUIRED');
  const origin = validateOrigin(options.origin, options.approvedHttpsOrigin);
  if (typeof options.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,32}$/.test(options.username) ||
      typeof options.password !== 'string' || options.password.length < 12 || options.password.length > 128 ||
      options.projectId !== undefined && !uuid(options.projectId)) fail('INVALID_CONFIGURATION');
  const requestTimeoutMs = options.requestTimeoutMs ?? 15000;
  const pollTimeoutMs = options.pollTimeoutMs ?? 180000;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  if (![requestTimeoutMs, pollTimeoutMs, pollIntervalMs].every(Number.isSafeInteger) || requestTimeoutMs < 1 || requestTimeoutMs > 60000 ||
      pollTimeoutMs < 1 || pollTimeoutMs > 600000 || pollIntervalMs < 1 || pollIntervalMs > 10000) fail('INVALID_CONFIGURATION');
  return { origin, requestTimeoutMs, pollTimeoutMs, pollIntervalMs };
}

async function boundedBytes(response, signal) {
  const limit = 1024 * 1024;
  if (!response.body) fail('INVALID_RESPONSE');
  const length = Number(response.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > limit) { void response.body.cancel().catch(() => {}); fail('INVALID_RESPONSE'); }
  const reader = response.body.getReader(); const chunks = []; let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) fail('REQUEST_TIMEOUT');
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { cancel(); fail('INVALID_RESPONSE'); }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks);
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
}

function providerFailure(code) {
  if (['AI_QUOTA_EXCEEDED', 'AI_RATE_LIMITED', 'RATE_LIMITED'].includes(code)) return 'QUOTA_STOP';
  if (['AI_ACCESS_DENIED', 'AI_NOT_CONFIGURED', 'AI_PROVIDER_NOT_APPROVED'].includes(code)) return 'ACCESS_STOP';
  return 'JOB_FAILED';
}

function validateProject(project, projectId) {
  if (project?.id !== projectId || typeof project.name !== 'string' || !marker.test(project.name) || !Array.isArray(project.ideas)) fail('CANARY_STATE_UNSAFE');
}

function validateJob(job, projectId, projectName, jobId) {
  if (!uuid(job?.id) || jobId && job.id !== jobId || job.projectId !== projectId || job.projectName !== projectName || job.type !== 'ideas' ||
      !['queued', 'running', 'completed', 'failed'].includes(job.status)) fail('CANARY_STATE_UNSAFE');
  if (job.status === 'failed') fail(providerFailure(job.errorCode));
  if (job.errorCode !== null) fail('CANARY_STATE_UNSAFE');
  return job;
}

function verifyIdeas(project, jobId) {
  if (project.generation?.ideas !== 'gemini' || project.ideas.length !== 10) fail('IDEAS_INVALID');
  const ids = new Set(); const titles = { th: new Set(), en: new Set() };
  for (const idea of project.ideas) {
    if (!idea || Object.keys(idea).sort().join(',') !== 'hook,id,logline,title' ||
        typeof idea.id !== 'string' || !idea.id.trim() || idea.id.length > 64 || ids.has(idea.id) || /^mock_/i.test(idea.id)) fail('IDEAS_INVALID');
    ids.add(idea.id);
    for (const field of ['title', 'logline', 'hook']) {
      const localized = idea[field];
      if (!localized || Object.keys(localized).sort().join(',') !== 'en,th') fail('IDEAS_INVALID');
      for (const locale of ['th', 'en']) {
        const text = localized[locale];
        if (typeof text !== 'string' || !text.trim() || text.length > 8000 ||
            !(locale === 'th' ? /[\u0e00-\u0e7f]/ : /[a-z]/i).test(text) || /MOCK sample data|ข้อมูลตัวอย่าง MOCK/i.test(text)) fail('IDEAS_INVALID');
        if (field === 'title') {
          const normalized = text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
          if (titles[locale].has(normalized)) fail('IDEAS_INVALID');
          titles[locale].add(normalized);
        }
      }
    }
  }
  if (project.aiUsage !== undefined && !Array.isArray(project.aiUsage)) fail('IDEAS_INVALID');
  const receipts = project.aiUsage ?? [];
  if (receipts.length > 1 || receipts.some(receipt => receipt?.operation !== 'ideas' || receipt.provider !== 'gemini' ||
      receipt.model !== model || !uuid(receipt.jobId) || receipt.jobId !== jobId)) fail('IDEAS_INVALID');
  if (['model', 'ideasModel'].some(key => project[key] !== undefined && project[key] !== model)) fail('IDEAS_INVALID');
  // Usage is optional; absent or unverified counts are never guessed or logged.
  const usage = receipts.length === 1 ? receipts[0] : null;
  const counts = ['inputTokens', 'outputTokens', 'totalTokens'];
  if (usage && counts.every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0) &&
      usage.totalTokens >= usage.inputTokens + usage.outputTokens &&
      (usage.cachedInputTokens === undefined || Number.isSafeInteger(usage.cachedInputTokens) && usage.cachedInputTokens >= 0 && usage.cachedInputTokens <= usage.inputTokens) &&
      (usage.reasoningTokens === undefined || Number.isSafeInteger(usage.reasoningTokens) && usage.reasoningTokens >= 0 && usage.reasoningTokens <= usage.outputTokens)) {
    return Object.fromEntries(counts.map(key => [key, usage[key]]));
  }
  return undefined;
}

/** One ideas enqueue at most. Never selects, expands, changes mode, retries or deletes. */
export async function verifyGeminiLive(options) {
  const config = settings(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const clock = options.now ?? (() => performance.now());
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let cookie; let csrf; let projectId; let jobId; let result; let failure;
  const checkpoint = () => ({ ...(projectId ? { projectId } : {}), ...(jobId ? { jobId } : {}) });
  const emit = (status, details = {}) => { try { log({ status, ...checkpoint(), ...details }); } catch { /* Observers never alter the run. */ } };
  const request = async (path, { method = 'GET', body, status = 200, timeoutMs = config.requestTimeoutMs } = {}) => {
    const controller = new AbortController(); let timer;
    const url = `${config.origin}/api${path}`;
    const operation = async () => {
      const headers = { Origin: config.origin, ...(cookie ? { Cookie: cookie } : {}), ...(csrf && method === 'POST' ? { 'X-CSRF-Token': csrf } : {}) };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetchImpl(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: controller.signal, credentials: 'omit' });
      if (controller.signal.aborted) { void response.body?.cancel().catch(() => {}); fail('REQUEST_TIMEOUT'); }
      if (response.redirected || response.url && response.url !== url || response.status >= 300 && response.status < 400) {
        void response.body?.cancel().catch(() => {}); fail('INVALID_RESPONSE');
      }
      // Capture only this invocation's login cookie. No browser/session database access.
      if (path === '/auth/login' && response.status === 200) {
        const sessions = response.headers.getSetCookie().map(value => value.split(';', 1)[0]).filter(value => /^acf_session=/.test(value));
        if (sessions.length === 1 && /^acf_session=[a-f0-9]{64}$/.test(sessions[0])) cookie = sessions[0];
      }
      const bytes = await boundedBytes(response, controller.signal);
      let value;
      try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('INVALID_RESPONSE'); }
      if (response.status !== status) {
        if (path === '/auth/login') fail('AUTH_FAILED');
        const known = providerFailure(value?.error?.code);
        fail(known === 'JOB_FAILED' ? 'REQUEST_FAILED' : known);
      }
      return value;
    };
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new GeminiVerificationError('REQUEST_TIMEOUT')); }, timeoutMs); });
    try { return await Promise.race([operation(), deadline]); }
    catch (error) { throw error instanceof GeminiVerificationError ? error : new GeminiVerificationError('REQUEST_FAILED'); }
    finally { clearTimeout(timer); }
  };
  const preflight = async () => {
    const { capabilities } = await request('/integrations/capabilities');
    const ai = capabilities?.ai;
    if (ai?.mode !== 'gemini' || ai.active !== 'gemini' || ai.fallbackReason !== null ||
        ai.modeChangeLocked !== undefined && ai.modeChangeLocked !== false || capabilities?.structuredData?.configured !== false ||
        capabilities.structuredData.active !== 'sqlite' || capabilities?.execution?.active !== 'local' ||
        capabilities.execution.cloudDeploymentVerified !== false ||
        ['model', 'ideasModel', 'expansionModel'].some(key => ai[key] !== undefined && ai[key] !== model)) fail('GEMINI_NOT_READY');
  };
  const jobs = async (name, expectedId) => {
    const value = await request('/jobs');
    if (!Array.isArray(value?.jobs)) fail('INVALID_RESPONSE');
    const matching = value.jobs.filter(job => job?.projectId === projectId);
    // Multiple/foreign job types are ambiguous. Resume never creates another job.
    if (matching.length !== 1) fail('CANARY_STATE_UNSAFE');
    if (uuid(matching[0]?.id)) jobId = matching[0].id;
    return validateJob(matching[0], projectId, name, expectedId);
  };
  try {
    const auth = await request('/auth/login', { method: 'POST', body: { username: options.username, password: options.password } });
    if (!cookie || typeof auth?.csrfToken !== 'string' || !/^[a-f0-9]{64}$/.test(auth.csrfToken)) fail('INVALID_RESPONSE');
    csrf = auth.csrfToken;
    await preflight(); emit('GEMINI_READY');
    let project; let job;
    if (options.projectId) {
      projectId = options.projectId;
      ({ project } = await request(`/projects/${projectId}`));
      validateProject(project, projectId);
      job = await jobs(project.name);
      jobId = job.id; emit('CANARY_RESUMED');
      if (job.status === 'completed') {
        const usage = verifyIdeas(project, jobId);
        result = { verified: true, status: 'CACHED', projectId, jobId, ideasCount: 10, ...(usage ? { usage } : {}) };
      } else if (project.ideas.length || project.selectedIdeaId !== null || project.package !== null) fail('CANARY_STATE_UNSAFE');
    } else {
      const name = `ACF GEMINI FREE TIER CANARY ${randomUUID()}`;
      let created;
      try {
        created = await request('/projects', { method: 'POST', status: 201, body: { name,
          brief: 'Generate ten distinct short fictional stories about a Thai neighborhood solving small everyday problems. Provide Thai and English titles, short loglines and hooks only. Do not expand or select any story.',
          genre: 'Everyday fiction', audience: 'Operator acceptance', aspectRatio: '9:16' } });
      } catch { fail('CANARY_CREATE_AMBIGUOUS'); }
      if (uuid(created?.project?.id)) projectId = created.project.id;
      if (!projectId) fail('CANARY_CREATE_AMBIGUOUS');
      emit('CANARY_CREATED');
      project = created.project; validateProject(project, projectId);
      if (project.name !== name || project.ideas.length || project.selectedIdeaId !== null || project.package !== null) fail('CANARY_STATE_UNSAFE');
      // Recheck immediately before the only enqueue; never mutate provider mode.
      await preflight();
      try {
        const queued = await request(`/projects/${projectId}/ideas`, { method: 'POST', status: 202, body: {} });
        if (uuid(queued?.job?.id)) jobId = queued.job.id;
        job = validateJob(queued?.job, projectId, project.name, jobId);
      } catch (error) {
        if (error instanceof GeminiVerificationError && ['QUOTA_STOP', 'ACCESS_STOP', 'JOB_FAILED'].includes(error.message)) throw error;
        fail('IDEAS_REQUEST_AMBIGUOUS');
      }
      emit('IDEAS_ENQUEUED');
    }
    if (!result) {
      const started = clock();
      for (;;) {
        const remaining = config.pollTimeoutMs - (clock() - started);
        if (remaining <= 0) fail('POLL_TIMEOUT');
        const value = await request('/jobs', { timeoutMs: Math.min(config.requestTimeoutMs, remaining) });
        if (!Array.isArray(value?.jobs)) fail('INVALID_RESPONSE');
        const matching = value.jobs.filter(item => item?.projectId === projectId);
        if (matching.length !== 1) fail('CANARY_STATE_UNSAFE');
        job = validateJob(matching[0], projectId, project.name, jobId);
        if (job.status === 'completed') {
          const remainingRead = config.pollTimeoutMs - (clock() - started);
          if (remainingRead <= 0) fail('POLL_TIMEOUT');
          const completed = await request(`/projects/${projectId}`, { timeoutMs: Math.min(config.requestTimeoutMs, remainingRead) });
          validateProject(completed?.project, projectId);
          if (completed.project.name !== project.name) fail('CANARY_STATE_UNSAFE');
          const usage = verifyIdeas(completed.project, jobId);
          result = { verified: true, status: 'LIVE', projectId, jobId, ideasCount: 10, ...(usage ? { usage } : {}) };
          break;
        }
        const budget = config.pollTimeoutMs - (clock() - started);
        if (budget <= 0) fail('POLL_TIMEOUT');
        let timer;
        try { await Promise.race([sleep(Math.min(config.pollIntervalMs, budget)), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new GeminiVerificationError('POLL_TIMEOUT')), Math.max(1, budget));
        })]); } finally { clearTimeout(timer); }
      }
    }
    emit(result.status, { ideasCount: result.ideasCount, ...(result.usage ? { usage: result.usage } : {}) });
    emit('OWNER_SELECTION_REQUIRED');
  } catch (error) { failure = error instanceof GeminiVerificationError ? error : new GeminiVerificationError('REQUEST_FAILED'); }
  finally {
    if (cookie) {
      try {
        const loggedOut = await request('/auth/logout', { method: 'POST', body: {} });
        if (loggedOut?.ok !== true) fail('LOGOUT_FAILED');
        emit('SESSION_LOGGED_OUT');
      } catch { emit('LOGOUT_FAILED'); failure ??= new GeminiVerificationError('LOGOUT_FAILED'); }
      cookie = undefined; csrf = undefined;
    }
  }
  if (failure) { failure.checkpoint = checkpoint(); emit(failure.message); throw failure; }
  return result;
}

const guidance = {
  INVALID_CONFIGURATION: 'ตรวจ origin และข้อมูลเข้าสู่ระบบใน private environment',
  FREE_TIER_CONFIRMATION_REQUIRED: 'ยืนยัน Free Tier ด้วย ACF_VERIFY_GEMINI_FREE_TIER_CONFIRMED=true ก่อนเริ่ม',
  AUTH_FAILED: 'เข้าสู่ระบบไม่สำเร็จ ตรวจบัญชี Owner',
  GEMINI_NOT_READY: 'ต้องเป็น Gemini ทั้ง mode/active ไม่มี fallback และไม่มี cloud lane; เครื่องมือนี้ไม่เปลี่ยน mode',
  QUOTA_STOP: 'หยุดเพราะโควตาหรือ rate limit; ห้าม retry หรือเปลี่ยนไปใช้ OpenAI',
  ACCESS_STOP: 'ตรวจสิทธิ์และ backend Free Tier/key/model; ห้าม retry อัตโนมัติ',
  CANARY_CREATE_AMBIGUOUS: 'การสร้าง canary อาจสำเร็จแล้ว ตรวจในแอปก่อน ห้ามเรียกซ้ำอัตโนมัติ',
  IDEAS_REQUEST_AMBIGUOUS: 'คำขอ ideas อาจได้รับแล้ว ใช้ --project-id เพื่อตรวจ canary เดิมเท่านั้น ห้ามสร้างซ้ำ',
  CANARY_STATE_UNSAFE: 'สถานะ canary ไม่แน่นอนหรือไม่ใช่ canary ที่กำหนด หยุดโดยไม่ retry',
  IDEAS_INVALID: 'ผลลัพธ์หรือหลักฐาน Gemini ไม่ผ่าน หยุดโดยไม่สร้างใหม่',
  JOB_FAILED: 'งานล้มเหลว หยุดโดยไม่ retry',
  POLL_TIMEOUT: 'หมดเวลารองาน ใช้ --project-id เพื่อตรวจงานเดิม ห้าม enqueue ซ้ำ',
  REQUEST_TIMEOUT: 'หมดเวลาคำขอ หยุดและตรวจ canary เดิมก่อนดำเนินการ',
  LOGOUT_FAILED: 'ปิด session ของการตรวจครั้งนี้ไม่สำเร็จ',
};

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const flags = {};
    for (let index = 0; index < argv.length; index += 2) {
      const flag = argv[index];
      if (!['--origin', '--approved-https-origin', '--project-id'].includes(flag) || flags[flag] !== undefined ||
          typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) fail('INVALID_CONFIGURATION');
      flags[flag] = argv[index + 1];
    }
    if (!flags['--origin']) fail('INVALID_CONFIGURATION');
    await verifyGeminiLive({ origin: flags['--origin'], approvedHttpsOrigin: flags['--approved-https-origin'], projectId: flags['--project-id'],
      username: env.ACF_VERIFY_USERNAME, password: env.ACF_VERIFY_PASSWORD, freeTierConfirmed: env.ACF_VERIFY_GEMINI_FREE_TIER_CONFIRMED === 'true',
      log: status => console.log(`Gemini verification: ${JSON.stringify(status)}`) });
    return 0;
  } catch (error) {
    const code = error instanceof GeminiVerificationError ? error.message : 'REQUEST_FAILED';
    console.error(`Gemini verification: ${code}. ${guidance[code] ?? 'หยุดการตรวจ ไม่ retry อัตโนมัติ; ตรวจ canary เดิมในแอป'}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
