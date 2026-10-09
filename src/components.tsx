import { useState, type FormEvent } from 'react';
import { AuthInputSchema, ProjectInputSchema, type Job, type Locale, type ProjectInput, type ProjectSummary } from '../shared/contracts';
import { errorMessages, jobLabels, jobStatusLabels, stageLabels, type Messages } from './i18n';
import { knownError } from './api';

export function ProjectCards({ projects, locale, m }: { projects: ProjectSummary[]; locale: Locale; m: Messages }) {
  return projects.length === 0 ? <div className="empty"><p>{m.emptyProjects}</p></div> : <div className="card-grid">{projects.map((project) => {
    let badgeClass = 'badge';
    if (project.status === 'ideas_ready' || project.status === 'clips_ready' || project.status === 'exported') badgeClass += ' success';
    else if (project.status === 'draft') badgeClass += ' warning';
    else badgeClass += ' active';
    return <article className="card" key={project.id}>
      <div style={{marginBottom: '16px'}}><span className={badgeClass}>{stageLabels[locale][project.status]}</span></div>
      <h3><a href={`#story/${encodeURIComponent(project.id)}`}>{project.name}</a></h3>
      <p className="muted">{project.genre} · {project.aspectRatio}</p>
      <p className="subdued">{m.updated}: {formatDate(project.updatedAt, locale)}</p>
    </article>;
  })}</div>;
}
export function formatDate(date: string, locale: Locale): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
export function isActive(job: Job): boolean { return job.status === 'queued' || job.status === 'running'; }

export function Jobs({ jobs, locale, m, disabled, retry }: { jobs: Job[]; locale: Locale; m: Messages; disabled: boolean; retry: (id: string) => void }) {
  return jobs.length === 0 ? <div className="empty"><p>{m.queueEmpty}</p></div> : <div className="stack">{jobs.map((job) => {
    const error = knownError(job.errorCode);
    const progress = Math.min(100, Math.max(0, Number.isFinite(job.progress) ? job.progress : 0));
    let statusClass = 'badge';
    if (job.status === 'running') statusClass += ' active';
    else if (job.status === 'completed') statusClass += ' success';
    else if (job.status === 'failed') statusClass += ' error';
    return <article className="card" key={job.id}>
      <h3><a href={`#story/${encodeURIComponent(job.projectId)}`}>{job.projectName}</a></h3>
      <p className="muted" style={{marginBottom: '16px'}}>{jobLabels[locale][job.type]} · <span className={statusClass}>{jobStatusLabels[locale][job.status]}</span></p>
      <label className="progress-label"><span>{m.progress}</span> <span>{new Intl.NumberFormat(locale).format(progress)}%</span></label>
      <progress value={progress} max={100} aria-label={`${job.projectName}: ${jobLabels[locale][job.type]} — ${m.progress}`} />
      {job.status === 'failed' && <div style={{marginTop: '16px'}}>
        <p className="alert" role="alert">{error ? errorMessages[locale][error] : m.unexpectedError}</p>
        <p className="muted">{m.retryInfo}</p>
        <div className="actions"><button disabled={disabled || jobs.some((other) => other.projectId === job.projectId && isActive(other))} onClick={() => retry(job.id)}>{m.retry}</button></div>
      </div>}
    </article>;
  })}</div>;
}

export function AuthForm({ setup, m, disabled, submit }: { setup: boolean; m: Messages; disabled: boolean; submit: (username: string, password: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [invalid, setInvalid] = useState(false);
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const valid = setup ? AuthInputSchema.safeParse({ username, password }).success : username.trim().length > 0 && password.length > 0;
    setInvalid(!valid);
    if (valid) submit(username, password);
  }
  return <section className="auth card"><h1>{setup ? m.setup : m.login}</h1><p className="muted">{setup ? m.setupInfo : m.loginInfo}</p>
    <form onSubmit={onSubmit} className="stack">
      <label>{m.username}<input name="username" required value={username} maxLength={32} minLength={setup ? 3 : 1} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>{m.password}<input name="password" type={passwordVisible ? 'text' : 'password'} required value={password} minLength={setup ? 12 : 1} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} onChange={(event) => setPassword(event.target.value)} /></label>
      <button type="button" className="secondary" aria-pressed={passwordVisible} onClick={() => setPasswordVisible(!passwordVisible)}>{passwordVisible ? m.hidePassword : m.showPassword}</button>
      {invalid && <p className="error" role="alert">{m.invalidForm}</p>}
      <div className="actions"><button disabled={disabled}>{setup ? m.setup : m.login}</button></div>
    </form>
  </section>;
}

export function ProjectForm({ m, disabled, submit }: { m: Messages; disabled: boolean; submit: (input: ProjectInput) => void }) {
  const [input, setInput] = useState<ProjectInput>({ name: '', brief: '', genre: '', audience: '', aspectRatio: '9:16' });
  const [invalid, setInvalid] = useState(false);
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const result = ProjectInputSchema.safeParse(input);
    setInvalid(!result.success);
    if (result.success) submit(result.data);
  }
  return <div className="split" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: '24px' }}>
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ marginBottom: 0 }}>{m.storyDirection}</h2>
        <span className="chip">{m.aiStoryFactoryLabel}</span>
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="full">{m.name}<input required maxLength={120} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></label>
        <label className="full">{m.brief}<textarea required minLength={10} maxLength={4000} rows={5} value={input.brief} aria-describedby="brief-help" onChange={(event) => setInput({ ...input, brief: event.target.value })} /><span id="brief-help" className="muted">{m.briefHelp}</span></label>
        <label>{m.genre}<input required maxLength={100} value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value })} /></label>
        <label>{m.audience}<input required maxLength={120} value={input.audience} onChange={(event) => setInput({ ...input, audience: event.target.value })} /></label>
        <label className="full">{m.aspectRatio}<select value={input.aspectRatio} onChange={(event) => setInput({ ...input, aspectRatio: event.target.value as ProjectInput['aspectRatio'] })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
        
        <div className="full notice" style={{ display: 'flex', gap: '12px', background: 'rgba(138,239,203,0.1)', padding: '16px', borderRadius: '8px', color: 'var(--text)' }}>
          <span style={{ fontSize: '20px' }}>✦</span>
          <p style={{ margin: 0 }}>{m.fixtureIdeasNotice}</p>
        </div>
        
        {invalid && <p className="full error" role="alert">{m.invalidForm}</p>}
        <div className="full actions"><button className="primary" disabled={disabled}>{m.tenShortIdeas}</button></div>
      </form>
    </section>
    
    <aside className="stack" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <section className="card glass">
        <span className="eyebrow">{m.oneStoryYourChoice}</span>
        <h2>{m.youChoose}</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: 'var(--accent)' }}>✓</span> {m.tenShortIdeas}</li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: 'var(--accent)' }}>✓</span> {m.saveExactlyOne}</li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '12px' }}><span style={{ color: 'var(--accent)' }}>✓</span> {m.expandOnlySelected}</li>
        </ul>
      </section>
    </aside>
  </div>;
}

export function CopyButton({ text, m }: { text: string; m: Messages }) {
  const [state, setState] = useState<'ready' | 'copied' | 'failed'>('ready');
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('ready'), 2000);
    } catch {
      const previous = document.activeElement;
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('aria-hidden', 'true'); area.className = 'copy-fallback'; document.body.append(area); area.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* Keep the selectable prompt available. */ }
      setState(copied ? 'copied' : 'failed');
      area.remove(); if (previous instanceof window.HTMLElement) previous.focus();
      if (copied) setTimeout(() => setState('ready'), 2000);
    }
  }
  return <div className="copy-feedback"><button type="button" className="secondary" onClick={() => void copy()}>{m.copyEnglishPrompt}</button><span role="status" className={state === 'failed' ? 'error' : state === 'copied' ? 'success' : 'sr-only'} style={state === 'copied' ? {color: 'var(--accent)'} : {}}>{state === 'failed' ? m.copyFailed : state === 'copied' ? m.promptCopied : ''}</span></div>;
}
