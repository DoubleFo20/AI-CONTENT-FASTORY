import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthState, Dashboard, Job, Locale, Project, ProjectInput, ProjectSummary } from '../shared/contracts';
import { download, jsonBody, request, RequestError } from './api';
import { AuthForm, isActive, Jobs, ProjectCards, ProjectForm } from './components';
import { dictionaries, errorMessages, stageLabels } from './i18n';
import Workspace from './Workspace';
import Modal from './Modal';
import { FACTORY_MODULES } from '../shared/modules';
import type { DriveStatus, RuntimeCapabilities } from '../shared/integrations';

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
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const session = useRef(new AbortController());
  const m = dictionaries[locale];
  const userId = auth?.user?.id;
  const projectId = route.page === 'story' ? route.projectId : undefined;
  const activeJobs = jobs.some(isActive);
  const disabled = !online || busy !== null;

  const clearPrivate = useCallback(() => {
    session.current.abort(); session.current = new AbortController();
    setDashboard(null); setProjects([]); setJobs([]); setProject(null); setBusy(null);
    setBaseLoading(false); setProjectLoading(false); setDrawerOpen(false); setPickerOpen(false); setCapabilities(null); setDrive(null);
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
    const [nextDashboard, nextProjects, nextJobs, nextProject, nextCapabilities, nextDrive] = await Promise.all([
      request<Dashboard>('/dashboard', { signal }),
      request<{ projects: ProjectSummary[] }>('/projects', { signal }),
      request<{ jobs: Job[] }>('/jobs', { signal }),
      id ? request<{ project: Project }>(`/projects/${encodeURIComponent(id)}`, { signal }) : Promise.resolve(null),
      request<{ capabilities: RuntimeCapabilities }>('/integrations/capabilities', { signal }),
      request<{ storage: DriveStatus }>('/integrations/drive/status', { signal }),
    ]);
    if (!signal.aborted && session.current === ownerSession) {
      setDashboard(nextDashboard); setProjects(nextProjects.projects); setJobs(nextJobs.jobs);
      setCapabilities(nextCapabilities.capabilities); setDrive(nextDrive.storage);
      if (nextProject) setProject(nextProject.project);
    }
  }, []);
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
    if (!userId || !online || !activeJobs) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { await refresh(controller.signal, projectId); }
      catch (cause) { if (!controller.signal.aborted) handleError(cause); }
      if (!controller.signal.aborted) timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
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
    if (busy || !online) return false;
    const controller = session.current;
    setBusy(key); setError(null);
    try { await task(controller.signal); return !controller.signal.aborted; }
    catch (cause) { if (!controller.signal.aborted) handleError(cause); return false; }
    finally { if (session.current === controller) setBusy(null); }
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
      if (!signal.aborted) setProject(result.project);
      await refresh(signal, projectId);
    });
  }
  async function upload(sceneId: string, file: File): Promise<boolean> {
    if (!projectId) return false;
    return action('upload', async (signal) => {
      const body = new FormData(); body.append('clip', file); body.append('sceneId', sceneId);
      await request(`/projects/${encodeURIComponent(projectId)}/clips`, { method: 'POST', body, signal }, auth?.csrfToken);
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
      {drawerOpen && <Modal title={m.navigation} closeLabel={m.closeDialog} className="navigation-drawer" onClose={() => setDrawerOpen(false)}>
        <nav className="stack" aria-label={m.navigation}>
          <a className="button secondary" href="#dashboard" onClick={() => setDrawerOpen(false)}>{m.dashboard}</a>
          <a className="button secondary" href="#stories" onClick={() => setDrawerOpen(false)}>{m.storyFactory}</a>
          <a className="button secondary" href="#queue" onClick={() => setDrawerOpen(false)}>{m.queue}</a>
          <h3>{m.tools}</h3>
          <button className="secondary" onClick={() => { setDrawerOpen(false); setPickerOpen(true); }}>{m.editorTool}</button>
          <h3>{m.other}</h3>
          {FACTORY_MODULES.filter((module) => module.state === 'planned').map((module) => <button key={module.id} className="secondary" disabled>{module.name[locale]} · {m.planned}</button>)}
          <button className="secondary" disabled={disabled} onClick={() => { setDrawerOpen(false); void logout(); }}>{m.logout}</button>
        </nav>
      </Modal>}
      {pickerOpen && <Modal title={m.projectPicker} closeLabel={m.closeDialog} onClose={() => setPickerOpen(false)}>
        <p>{m.editorPickerInfo}</p>
        {baseLoading ? <p role="status">{m.loading}</p> : projects.length ? <div className="stack">{projects.map((item) => <a key={item.id} className="button secondary picker-project" href={`#story/${encodeURIComponent(item.id)}/clips`} onClick={() => setPickerOpen(false)}><span>{item.name}</span><span className="badge">{stageLabels[locale][item.status]}</span></a>)}</div> : <><p>{m.noProjectsForEditor}</p><a className="button" href="#stories" onClick={() => setPickerOpen(false)}>{m.createStory}</a></>}
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
        </aside>
        {route.page === 'dashboard' && <>
          <h1 className="hero-title">{m.dashboard}</h1>
          <p><a className="button" href="#stories">{m.createContent}</a></p>
          {dashboard && <div className="metrics" style={{ marginTop: '32px' }}>
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
          {!baseLoading && dashboard && <Jobs jobs={jobs} locale={locale} m={m} disabled={disabled} retry={retryJob} />}
        </>}
        {route.page === 'story' && (projectLoading ? <p role="status">{m.loading}</p> : project && project.id === projectId ? <Workspace key={project.id} project={project} contentMode={contentMode} section={route.section} jobs={jobs.filter((job) => job.projectId === project.id)} locale={locale} m={m} disabled={disabled || !dashboard} operate={operate} select={selectIdea} upload={upload} download={downloadFile} videoError={videoError} /> : <button disabled={disabled} onClick={reload}>{m.refresh}</button>)}
      </>}
    </main>
  </div>;
}
