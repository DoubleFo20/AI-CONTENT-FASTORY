import { useState, type FormEvent } from 'react';
import { AuthInputSchema, ProjectInputSchema, type Job, type Locale, type ProjectInput, type ProjectSummary } from '../shared/contracts';
import { errorMessages, jobLabels, jobStatusLabels, stageLabels, type Messages } from './i18n';
import { knownError } from './api';

export function ProjectCards({ projects, locale, m }: { projects: ProjectSummary[]; locale: Locale; m: Messages }) {
  return projects.length === 0 ? <p className="empty">{m.emptyProjects}</p> : <div className="card-grid">{projects.map((project) => <article className="card" key={project.id}>
    <span className="badge">{stageLabels[locale][project.status]}</span><h3><a href={`#story/${encodeURIComponent(project.id)}`}>{project.name}</a></h3>
    <p>{project.genre} · {project.aspectRatio}</p><p className="muted">{m.updated}: {formatDate(project.updatedAt, locale)}</p>
  </article>)}</div>;
}
export function formatDate(date: string, locale: Locale): string {
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}
export function isActive(job: Job): boolean { return job.status === 'queued' || job.status === 'running'; }

export function Jobs({ jobs, locale, m, disabled, retry }: { jobs: Job[]; locale: Locale; m: Messages; disabled: boolean; retry: (id: string) => void }) {
  return jobs.length === 0 ? <p className="empty">{m.queueEmpty}</p> : <div className="stack">{jobs.map((job) => {
    const error = knownError(job.errorCode);
    const progress = Math.min(100, Math.max(0, Number.isFinite(job.progress) ? job.progress : 0));
    return <article className="card" key={job.id}>
      <h3><a href={`#story/${encodeURIComponent(job.projectId)}`}>{job.projectName}</a></h3>
      <p>{jobLabels[locale][job.type]} · <strong>{jobStatusLabels[locale][job.status]}</strong></p>
      <label className="progress-label">{m.progress}: {new Intl.NumberFormat(locale).format(progress)}%<progress value={progress} max={100} /></label>
      {job.status === 'failed' && <><p className="error">{error ? errorMessages[locale][error] : m.unexpectedError}</p><p className="muted">{m.retryInfo}</p>
        <button disabled={disabled || jobs.some((other) => other.projectId === job.projectId && isActive(other))} onClick={() => retry(job.id)}>{m.retry}</button></>}
    </article>;
  })}</div>;
}

export function AuthForm({ setup, m, disabled, submit }: { setup: boolean; m: Messages; disabled: boolean; submit: (username: string, password: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState(false);
  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const valid = setup ? AuthInputSchema.safeParse({ username, password }).success : username.trim().length > 0 && password.length > 0;
    setInvalid(!valid);
    if (valid) submit(username, password);
  }
  return <section className="auth card"><h1>{setup ? m.setup : m.login}</h1><p>{setup ? m.setupInfo : m.loginInfo}</p>
    <form onSubmit={onSubmit} className="stack">
      <label>{m.username}<input name="username" required value={username} maxLength={32} minLength={setup ? 3 : 1} autoComplete="username" autoCapitalize="none" spellCheck={false} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>{m.password}<input name="password" type="password" required value={password} minLength={setup ? 12 : 1} maxLength={128} autoComplete={setup ? 'new-password' : 'current-password'} onChange={(event) => setPassword(event.target.value)} /></label>
      {invalid && <p className="error" role="alert">{m.invalidForm}</p>}
      <button disabled={disabled}>{disabled ? m.working : setup ? m.setup : m.login}</button>
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
  return <section className="card"><h2>{m.createStory}</h2><form className="form-grid" onSubmit={onSubmit}>
    <label>{m.name}<input required maxLength={120} value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} /></label>
    <label>{m.genre}<input required maxLength={100} value={input.genre} onChange={(event) => setInput({ ...input, genre: event.target.value })} /></label>
    <label>{m.audience}<input required maxLength={120} value={input.audience} onChange={(event) => setInput({ ...input, audience: event.target.value })} /></label>
    <label>{m.aspectRatio}<select value={input.aspectRatio} onChange={(event) => setInput({ ...input, aspectRatio: event.target.value as ProjectInput['aspectRatio'] })}><option>9:16</option><option>16:9</option><option>1:1</option></select></label>
    <label className="full">{m.brief}<textarea required minLength={10} maxLength={4000} rows={5} value={input.brief} aria-describedby="brief-help" onChange={(event) => setInput({ ...input, brief: event.target.value })} /><span id="brief-help" className="muted">{m.briefHelp}</span></label>
    {invalid && <p className="full error" role="alert">{m.invalidForm}</p>}
    <div className="full"><button disabled={disabled}>{disabled ? m.working : m.create}</button></div>
  </form></section>;
}

export function CopyButton({ text, m }: { text: string; m: Messages }) {
  const [state, setState] = useState<'ready' | 'copied' | 'failed'>('ready');
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      const previous = document.activeElement;
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('aria-hidden', 'true'); area.className = 'copy-fallback'; document.body.append(area); area.select();
      try { setState(document.execCommand('copy') ? 'copied' : 'failed'); } catch { setState('failed'); }
      area.remove(); if (previous instanceof window.HTMLElement) previous.focus();
    }
  }
  return <div><button type="button" className="secondary" onClick={() => void copy()}>{state === 'copied' ? m.copied : m.copy}</button><span role="status" className={state === 'failed' ? 'error' : 'sr-only'}>{state === 'failed' ? m.copyFailed : state === 'copied' ? m.copied : ''}</span></div>;
}
