import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthState, Dashboard, Job, Locale, Project, ProjectInput, ProjectSummary } from '../shared/contracts';
import { download, jsonBody, request, RequestError } from './api';
import { AiModeForm, AuthForm, isActive, Jobs, ProjectCards, ProjectForm, WorkerStatus, type WorkerRuntimeStatus } from './components';
import { dictionaries, errorMessages, stageLabels } from './i18n';
import Workspace from './Workspace';
import Modal from './Modal';
import { FACTORY_MODULES } from '../shared/modules';
import type { AiRuntimeStatus, DriveStatus, RuntimeCapabilities } from '../shared/integrations';

type ContentMode = 'th' | 'en' | 'th+en';
function readContentMode(): ContentMode {
  try {
    const value = window.localStorage.getItem('acf-content-mode');
    return value === 'en' || value === 'th+en' ? value : 'th';
  } catch { return 'th'; }
}

interface Route { page: 'dashboard' | 'stories' | 'queue' | 'story'; projectId?: string; section?: string }
function readRoute(): Route {
  const parts = window.location.hash.slice(1).split('/');
  if (parts[0] === 'story' && parts[1]) {
    try { return { page: 'story', projectId: decodeURIComponent(parts[1]), section: parts[2] }; } catch { return { page: 'dashboard' }; }
  }
  return { page: parts[0] === 'stories' || parts[0] === 'queue' ? parts[0] : 'dashboard' };
}
function readLocale(): Locale {
  try { return window.localStorage.getItem('acf-locale') === 'en' ? 'en' : 'th'; } catch { return 'th'; }
}
type UiError = RequestError['code'] | 'VIDEO_ERROR' | null;

export default function App() {
  const [locale, setLocale] = useState<Locale>(readLocale);
  const [contentMode, setContentMode] = useState<ContentMode>(readContentMode);
  const [route, setRoute] = useState<Route>(readRoute);
  const [online, setOnline] = useState(navigator.onLine);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<UiError>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [worker, setWorker] = useState<WorkerRuntimeStatus | null>(null);
  const session = useRef(new AbortController());
  const actionPending = useRef(false);
  const refreshVersion = useRef(0);
  const m = dictionaries[locale];
  const userId = auth?.user?.id;
  const projectId = route.page === 'story' ? route.projectId : undefined;
  const routeProject = useRef(projectId); routeProject.current = projectId;
  const activeJobs = jobs.some(isActive);
  const disabled = !online || busy !== null;

  const clearPrivate = useCallback(() => {
    session.current.abort(); session.current = new AbortController();
    actionPending.current = false;
    setDashboard(null); setProjects([]); setJobs([]); setProject(null); setBusy(null);
    setBaseLoading(false); setProjectLoading(false); setDrawerOpen(false); setPickerOpen(false); setSettingsOpen(false); setCapabilities(null); setDrive(null); setWorker(null);
  }, []);
  const handleError = useCallback((cause: unknown) => {
    const code = cause instanceof RequestError ? cause.code : 'INTERNAL_ERROR';
    if (code === 'AUTH_REQUIRED' || code === 'CSRF_INVALID') {
      clearPrivate(); setAuth({ user: null, csrfToken: null, setupRequired: false });
    }
    setError(code);
  }, [clearPrivate]);

  const checkAuth = useCallback(async (signal: AbortSignal) => {
    setAuthLoading(true);
    try {
      const next = await request<AuthState>('/auth/status', { signal });
      if (!signal.aborted) { setAuthLoading(false); if (!next.user) clearPrivate(); setAuth(next); setError(null); }
    } catch (cause) { if (!signal.aborted) { setAuthLoading(false); handleError(cause); } }
  }, [handleError, clearPrivate]);
  useEffect(() => {
    const controller = new AbortController();
    void checkAuth(controller.signal);
    return () => controller.abort();
  }, [checkAuth]);
  useEffect(() => {
    document.documentElement.lang = locale;
    try { window.localStorage.setItem('acf-locale', locale); } catch { /* Locale still works without browser storage. */ }
  }, [locale]);
  useEffect(() => {
    try { window.localStorage.setItem('acf-content-mode', contentMode); } catch { /* Ignore */ }
  }, [contentMode]);
  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); setDrawerOpen(false); setPickerOpen(false); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('hashchange', onHash); window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); session.current.abort(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    session.current.abort(); session.current = controller;
    return () => controller.abort();
  }, [userId]);

  const refresh = useCallback(async (signal: AbortSignal, id?: string) => {
    const ownerSession = session.current;
    const version = ++refreshVersion.current;
    const current = () => !signal.aborted && session.current === ownerSession && version === refreshVersion.current;
    const integrationError = (cause: unknown) => {
      if (current() && cause instanceof RequestError && (cause.code === 'AUTH_REQUIRED' || cause.code === 'CSRF_INVALID')) handleError(cause);
    };
    // Optional services reconcile independently so a slow Drive request never holds the workspace open.
    void request<{ capabilities: RuntimeCapabilities }>('/integrations/capabilities', { signal })
      .then((result) => { if (current()) setCapabilities(result.capabilities); })
      .catch((cause: unknown) => { if (current()) setCapabilities(null); integrationError(cause); });
    void request<{ storage: DriveStatus }>('/integrations/drive/status', { signal })
      .then((result) => { if (current()) setDrive(result.storage); })
      .catch((cause: unknown) => { if (current()) setDrive(null); integrationError(cause); });
    void request<{ worker: WorkerRuntimeStatus }>('/queue/status', { signal })
      .then((result) => { if (current()) setWorker(result.worker); })
      .catch((cause: unknown) => { if (current()) setWorker(null); integrationError(cause); });
    const results = await Promise.allSettled([
      request<Dashboard>('/dashboard', { signal }),
      request<{ projects: ProjectSummary[] }>('/projects', { signal }),
      request<{ jobs: Job[] }>('/jobs', { signal }),
      id ? request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, { signal }) : Promise.resolve(null),
    ]);
    if (signal.aborted || session.current !== ownerSession || version !== refreshVersion.current) return;
    // Authentication failures invalidate all private data, including otherwise successful responses.
    const authFailure = results.find((result) => result.status === 'rejected' && result.reason instanceof RequestError && (result.reason.code === 'AUTH_REQUIRED' || result.reason.code === 'CSRF_INVALID'));
    if (authFailure?.status === 'rejected') throw authFailure.reason;
    const [nextDashboard, nextProjects, nextJobs, nextProject] = results;
    if (nextDashboard.status === 'fulfilled') setDashboard(nextDashboard.value);
    if (nextProjects.status === 'fulfilled') setProjects(nextProjects.value.projects);
    if (nextJobs.status === 'fulfilled') setJobs(nextJobs.value.jobs);
    if (nextProject.status === 'fulfilled' && nextProject.value && id === routeProject.current) setProject(nextProject.value.project);
    const coreFailure = results.find((result) => result.status === 'rejected');
    if (coreFailure?.status === 'rejected') throw coreFailure.reason;
  }, [handleError]);
  useEffect(() => {
    if (!userId || !online) return;
    const controller = new AbortController();
    setBaseLoading(true);
    void refresh(controller.signal).catch((cause: unknown) => { if (!controller.signal.aborted) handleError(cause); }).finally(() => { if (!controller.signal.aborted) setBaseLoading(false); });
    return () => controller.abort();
  }, [userId, online, refresh, handleError]);
  useEffect(() => {
    if (!userId || !online || !projectId) return;
    const controller = new AbortController();
    const ownerSession = session.current;
    setProjectLoading(true); setProject(null);
    void request<{ project: Project }>(`/projects/${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted && session.current === ownerSession) setProject(result.project); })
      .catch((cause: unknown) => { if (!controller.signal.aborted) handleError(cause); })
      .finally(() => { if (!controller.signal.aborted) setProjectLoading(false); });
    return () => controller.abort();
  }, [userId, online, projectId, handleError]);
  useEffect(() => {
    if (!userId || !online) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(controller.signal, projectId); }
      catch (cause) { if (!controller.signal.aborted) handleError(cause); }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), activeJobs ? 3000 : 10000);
    }
    timer = setTimeout(() => void poll(), activeJobs ? 3000 : 10000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [userId, online, activeJobs, projectId, refresh, handleError]);
  useEffect(() => {
    if (!userId) return;
    if (route.section && project?.id === projectId) {
      const panel = document.getElementById(`workspace-${route.section}`) ?? document.getElementById('workspace-brief');
      panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: 'start' });
    }
    else document.getElementById('content')?.focus();
  }, [route.page, route.section, projectId, project?.id, userId]);

  async function action(key: string, task: (signal: AbortSignal) => Promise<void>): Promise<boolean> {
    if (actionPending.current || !online) return false;
    const controller = session.current;
    actionPending.current = true;
    setBusy(key); setError(null);
    try { await task(controller.signal); return !controller.signal.aborted; }
    catch (cause) { if (!controller.signal.aborted) handleError(cause); return false; }
    finally { if (session.current === controller) { actionPending.current = false; setBusy(null); } }
  }
  function signIn(username: string, password: string) {
    void action('auth', async (signal) => {
      const next = await request<AuthState>(auth?.setupRequired ? '/auth/setup' : '/auth/login', { ...jsonBody({ username, password }), signal });
      if (!signal.aborted) { clearPrivate(); setAuth(next); window.location.hash = 'dashboard'; }
    });
  }
  async function logout() {
    const csrf = auth?.csrfToken;
    clearPrivate(); setAuth({ user: null, csrfToken: null, setupRequired: false }); setError(null); window.location.hash = 'dashboard';
    setBusy('logout');
    try { await request('/auth/logout', { method: 'POST' }, csrf); }
    catch (cause) { handleError(cause); }
    finally { setBusy(null); }
  }
  function createProject(input: ProjectInput) {
    void action('create', async (signal) => {
      const result = await request<{ project: Project }>('/projects', { ...jsonBody(input), signal }, auth?.csrfToken);
      if (!signal.aborted) { setProject(result.project); window.location.hash = `story/${encodeURIComponent(result.project.id)}`; await refresh(signal); }
    });
  }
  function operate(operation: 'ideas' | 'expand' | 'export') {
    if (!projectId) return;
    void action(operation, async (signal) => {
      const result = await request<{ job: Job }>(`/projects/${encodeURIComponent(projectId)}/${operation}`, { method: 'POST', signal }, auth?.csrfToken);
      if (!signal.aborted) setJobs((previous) => [result.job, ...previous.filter((job) => job.id !== result.job.id)]);
      await refresh(signal, projectId);
    });
  }
  function selectIdea(ideaId: string) {
    if (!projectId) return;
    void action('select', async (signal) => {
      const result = await request<{ project: Project }>(`/projects/${encodeURIComponent(projectId)}/select`, { ...jsonBody({ ideaId }), signal }, auth?.csrfToken);
      if (!signal.aborted && result.project.id === routeProject.current) setProject(result.project);
      await refresh(signal, projectId);
    });
  }
  async function upload(sceneId: string, file: File, importSignal?: AbortSignal): Promise<boolean> {
    if (!projectId) return false;
    return action('upload', async (signal) => {
      const body = new FormData(); body.append('clip', file); body.append('sceneId', sceneId);
      const combined = importSignal ? AbortSignal.any([signal, importSignal]) : signal;
      try { await request(`/projects/${encodeURIComponent(projectId)}/clips`, { method: 'POST', body, signal: combined }, auth?.csrfToken); }
      catch (error) { if (importSignal?.aborted) return; throw error; }
      await refresh(signal, projectId);
    });
  }
  function retryJob(id: string) {
    void action('retry', async (signal) => {
      const result = await request<{ job: Job }>(`/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', signal }, auth?.csrfToken);
      if (!signal.aborted) setJobs((previous) => [result.job, ...previous.filter((job) => job.id !== result.job.id)]);
      await refresh(signal, projectId);
    });
  }
  function cancelJob(id: string) {
    void action('cancel', async (signal) => {
      const result = await request<{ job: Job }>(`/jobs/${encodeURIComponent(id)}/cancel`, { ...jsonBody({}), signal }, auth?.csrfToken);
      if (!signal.aborted) setJobs((previous) => [result.job, ...previous.filter((job) => job.id !== result.job.id)]);
      await refresh(signal, projectId);
    });
  }
  function setAiMode(mode: 'mock' | 'openai') {
    void action('mode', async (signal) => {
      const result = await request<{ ai: AiRuntimeStatus }>('/integrations/ai/mode', { ...jsonBody({ mode }), signal }, auth?.csrfToken);
      if (!signal.aborted) setCapabilities((previous) => previous ? { ...previous, ai: result.ai } : previous);
      await refresh(signal, projectId);
    });
  }
  function videoError() {
    setError('VIDEO_ERROR');
    const signal = session.current.signal;
    void request<AuthState>('/auth/status', { signal }).then((next) => {
      if (!signal.aborted && !next.user) { clearPrivate(); setAuth(next); setError('AUTH_REQUIRED'); }
    }).catch((cause: unknown) => { if (!signal.aborted) handleError(cause); });
  }
  function downloadFile(path: string, name: string) { void action('download', (signal) => download(path, name, signal)); }
  function reload() {
    if (userId) void action('refresh', (signal) => refresh(signal, projectId));
    else void checkAuth(session.current.signal);
  }
  const errorText = error === 'NETWORK_ERROR' ? m.networkError : error === 'VIDEO_ERROR' ? m.videoError : error ? errorMessages[locale][error] : '';

  return <div className={`app ${userId ? 'signed-in' : ''}`}>
    <a className="skip-link" href="#content" onClick={(event) => { event.preventDefault(); document.getElementById('content')?.focus(); }}>{m.skip}</a>
    <header className="topbar">
      <a className="brand" href="#dashboard">{m.brand}</a>
      <div className="top-actions">
        <label className="locale"><span className="sr-only">{m.language}</span><select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}><option value="th">ไทย</option><option value="en">English</option></select></label>
        {userId && <label className="content-mode"><span className="sr-only">{m.contentMode}</span><select value={contentMode} onChange={(event) => setContentMode(event.target.value as ContentMode)}><option value="th">TH</option><option value="en">EN</option><option value="th+en">TH+EN</option></select></label>}
        {userId && <button className="secondary menu-toggle" aria-expanded={drawerOpen} aria-haspopup="dialog" onClick={() => setDrawerOpen(true)}>{m.navigation}</button>}
      </div>
    </header>

    {userId && <>
      {/* Desktop/Tablet Sidebar */}
      <nav className="sidebar" aria-label={m.navigation}>
        <a href="#dashboard" aria-label={m.dashboard} title={m.dashboard} aria-current={route.page === 'dashboard' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">⌂</span><span className="nav-label">{m.dashboard}</span></a>
        <a href="#stories" aria-label={m.storyFactory} title={m.storyFactory} aria-current={route.page === 'stories' || route.page === 'story' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">✦</span><span className="nav-label">{m.storyFactory}</span></a>
        <a href="#queue" aria-label={m.queue} title={m.queue} aria-current={route.page === 'queue' ? 'page' : undefined}><span className="nav-icon" aria-hidden="true">≡</span><span className="nav-label">{m.queue}</span></a>
        <div className="sidebar-section">{m.tools}</div>
        <button type="button" className="secondary nav-action" aria-label={m.editorTool} title={m.editorTool} onClick={() => setPickerOpen(true)}><span className="nav-icon" aria-hidden="true">▤</span><span className="nav-label">{m.editorTool}</span></button>
        <div className="sidebar-section">{m.other}</div>
        {FACTORY_MODULES.filter((module) => module.state === 'planned').map((module) => <button key={module.id} type="button" className="secondary nav-action planned" disabled aria-label={`${module.name[locale]}: ${m.planned}`} title={`${module.name[locale]}: ${m.planned}`}><span className="nav-icon" aria-hidden="true">◷</span><span className="nav-label">{module.name[locale]} · {m.planned}</span></button>)}
        <button type="button" className="secondary nav-action" aria-label={m.logout} title={m.logout} disabled={disabled} onClick={() => void logout()}><span className="nav-icon" aria-hidden="true">↪</span><span className="nav-label">{m.logout}</span></button>
      </nav>
      <nav className="bottom-nav" aria-label={m.navigation}>
        <a href="#dashboard" aria-current={route.page === 'dashboard' ? 'page' : undefined}>{m.studio}</a>
        <a href="#stories" aria-current={route.page === 'stories' || route.page === 'story' ? 'page' : undefined}>{m.createContent}</a>
        <a href="#queue" aria-current={route.page === 'queue' ? 'page' : undefined}>{m.queue}</a>
        <button type="button" aria-haspopup="dialog" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>{m.more}</button>
      </nav>
      <div className={`drawer-overlay ${drawerOpen ? 'drawer-open' : ''}`} onClick={() => setDrawerOpen(false)} aria-hidden="true" />
      <div id="navigation-drawer" className={`drawer-content ${drawerOpen ? 'drawer-open' : ''}`} role="dialog" aria-modal="true" aria-label={m.navigation}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ marginBottom: 0 }}>{m.navigation}</h2>
          <button className="secondary" onClick={() => setDrawerOpen(false)}>{m.closeDialog}</button>
        </div>
        <nav className="stack" aria-label={m.navigation}>
          <a className="button secondary" href="#dashboard" onClick={() => setDrawerOpen(false)}>{m.dashboard}</a>
          <a className="button secondary" href="#stories" onClick={() => setDrawerOpen(false)}>{m.storyFactory}</a>
          <a className="button secondary" href="#queue" onClick={() => setDrawerOpen(false)}>{m.queue}</a>
          <h3>{m.tools}</h3>
          <button className="secondary" onClick={() => { setDrawerOpen(false); setPickerOpen(true); }}>{m.editorTool}</button>
          <h3>{m.other}</h3>
          {FACTORY_MODULES.filter((module) => module.state === 'planned').map((module) => <button key={module.id} className="secondary" disabled>{module.name[locale]} · {m.planned}</button>)}
          <button className="secondary" disabled={disabled} onClick={() => { setDrawerOpen(false); void logout(); }} style={{ marginTop: 'auto' }}>{m.logout}</button>
        </nav>
      </div>
      {pickerOpen && <Modal title={m.projectPicker} closeLabel={m.closeDialog} onClose={() => setPickerOpen(false)}>
        <p>{m.editorPickerInfo}</p>
        {baseLoading ? <p role="status">{m.loading}</p> : projects.length ? <div className="stack">{projects.map((item) => <a key={item.id} className="button secondary picker-project" href={`#story/${encodeURIComponent(item.id)}/clips`} onClick={() => setPickerOpen(false)}><span>{item.name}</span><span className="badge">{stageLabels[locale][item.status]}</span></a>)}</div> : <><p>{m.noProjectsForEditor}</p><a className="button" href="#stories" onClick={() => setPickerOpen(false)}>{m.createStory}</a></>}
      </Modal>}
      {settingsOpen && <Modal title={m.settings} closeLabel={m.closeDialog} onClose={() => setSettingsOpen(false)}>
        <AiModeForm key={capabilities?.ai.mode ?? 'unknown'} ai={capabilities?.ai ?? null} m={m} disabled={disabled} active={activeJobs || worker?.state === 'running'} setMode={setAiMode} />
        <div className="actions"><button className="secondary" disabled={disabled} onClick={reload}>{m.refresh}</button></div>
      </Modal>}
    </>}

    <main id="content" tabIndex={-1}>
      {!online && <p className="notice" role="status">{m.offline}</p>}
      {error && <div className="alert" role="alert"><p>{errorText}</p><div className="actions"><button className="secondary" disabled={!online || !!busy} onClick={reload}>{m.refresh}</button><button className="secondary" onClick={() => setError(null)}>{m.close}</button></div></div>}
      <div role="status" aria-live="polite">{busy && <p className="notice">{m.working}</p>}</div>
      {authLoading ? <p role="status">{m.loading}</p> : !userId ? auth ? <AuthForm key={String(auth.setupRequired)} setup={auth.setupRequired} m={m} disabled={disabled} submit={signIn} /> : <button disabled={!online} onClick={reload}>{m.retry}</button> : <>

        {baseLoading && <p role="status">{m.loading}</p>}
        <aside className="capability-info" aria-label={m.capabilities}>
          {capabilities ? <><p><strong>{m.aiProvider}:</strong> {capabilities.ai.active === 'mock' ? m.mockContent : m.openaiProvider} <span className="muted">({m.aiMode}: {capabilities.ai.mode})</span></p>
            {capabilities.ai.fallbackReason && <p className="muted">{m.aiFallback}: {capabilities.ai.fallbackReason === 'quota' ? m.fallbackQuota : capabilities.ai.fallbackReason === 'access' ? m.fallbackAccess : m.fallbackNotConfigured}</p>}
          </> : <p>{m.capabilitiesUnknown}</p>}
          <p>{m.storageLocal} · {drive ? drive.state === 'connected' && drive.connected ? m.driveGrantConnected : drive.state === 'failed' ? m.driveFailed : m.noDriveConnection : m.driveUnknown}</p>
          <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>{m.settings}</button>
        </aside>
        {route.page === 'dashboard' && <>
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">{m.creativeSpace}</span>
              <h1>{m.brand}<br/>{m.heroTitle}</h1>
              <p>{m.heroSubtitle}</p>
              <div className="actions">
                <a className="button primary" href="#stories">{m.createContent}</a>
                <a className="button quiet" href="#stories">{m.continueSample}</a>
              </div>
            </div>
            <div className="film-window" aria-hidden="true">
              <div className="orb"></div>
              <div className="skyline"></div>
              <div className="rails"></div>
              <div className="floating-note">✦ {m.sampleScene}</div>
            </div>
          </section>
          
          <div className="studio-grid">
            <div className="section-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ marginBottom: 0 }}>{m.chooseCreativeSpace}</h2>
            </div>
            <div className="module-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
              <button className="module story" onClick={() => { window.location.hash = 'stories'; }} style={{ textAlign: 'left', padding: '24px' }}>
                <h3>AI Story Factory</h3>
                <p className="muted">{m.storyFactoryHero}</p>
                <span className="chip">{m.startStory} →</span>
              </button>
            </div>
          </div>
          
          {dashboard && <div className="metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            <div className="card metric"><span>{m.projectsCount}</span><strong>{new Intl.NumberFormat(locale).format(dashboard.projectsCount)}</strong></div>
            <div className="card metric"><span>{m.activeJobsCount}</span><strong>{new Intl.NumberFormat(locale).format(dashboard.activeJobsCount)}</strong></div>
            <div className="card metric"><span>{m.completedCount}</span><strong>{new Intl.NumberFormat(locale).format(dashboard.completedCount)}</strong></div>
          </div>}
          <h2 style={{ marginTop: '32px' }}>{m.recent}</h2>
          {dashboard && <ProjectCards projects={dashboard.recentProjects} locale={locale} m={m} />}
        </>}
        {route.page === 'stories' && <>
          <header className="page-heading"><h1>{m.storyFactory}</h1><button className="secondary" disabled={disabled} onClick={reload}>{m.refresh}</button></header>
          <ProjectForm m={m} disabled={disabled} submit={createProject} />
          <h2 style={{ marginTop: '32px' }}>{m.stories}</h2>
          {!baseLoading && dashboard && <ProjectCards projects={projects} locale={locale} m={m} />}
        </>}
        {route.page === 'queue' && <>
          <header className="page-heading"><h1>{m.queue}</h1><button className="secondary" disabled={disabled} onClick={reload}>{m.refresh}</button></header>
          <WorkerStatus worker={worker} locale={locale} m={m} />
          {!baseLoading && <Jobs jobs={jobs} locale={locale} m={m} disabled={disabled} retry={retryJob} cancel={cancelJob} />}
        </>}
        {route.page === 'story' && (projectLoading ? <p role="status">{m.loading}</p> : project && project.id === projectId ? <Workspace key={project.id} project={project} contentMode={contentMode} section={route.section} jobs={jobs.filter((job) => job.projectId === project.id)} locale={locale} m={m} disabled={disabled} ai={capabilities?.ai ?? null} worker={worker} modeBlocked={activeJobs || worker?.state === 'running'} setAiMode={setAiMode} retry={retryJob} cancel={cancelJob} csrf={auth?.csrfToken ?? null} onError={handleError} operate={operate} select={selectIdea} upload={upload} download={downloadFile} videoError={videoError} /> : <button disabled={disabled} onClick={reload}>{m.refresh}</button>)}
      </>}
    </main>
  </div>;
}
