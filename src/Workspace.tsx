import { useState, type FormEvent } from 'react';
import type { Clip, Job, Locale, Project, Scene } from '../shared/contracts';
import { CopyButton, Jobs, isActive } from './components';
import { stageLabels, type Messages } from './i18n';

type Operation = 'ideas' | 'expand' | 'export';
interface Props {
  project: Project; jobs: Job[]; locale: Locale; m: Messages; disabled: boolean;
  operate: (operation: Operation) => void; select: (ideaId: string) => void;
  upload: (sceneId: string, file: File) => Promise<boolean>;
  download: (path: string, name: string) => void; retry: (jobId: string) => void;
  videoError: () => void;
}
function ClipImport({ scene, clip, locale, m, disabled, upload, videoError }: { scene: Scene; clip: Clip | undefined; locale: Locale; m: Messages; disabled: boolean; upload: Props['upload']; videoError: Props['videoError'] }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (file && await upload(scene.id, file)) { setFile(null); setInputKey((key) => key + 1); }
  }
  return <article className="card"><h3>{scene.order}. {scene.title[locale]}</h3>
    {clip ? <><p><strong>{m.latestClip}</strong>: {clip.originalName} · {clip.durationSeconds.toFixed(1)} {m.seconds}</p>
      <video controls preload="none" src={`/api/clips/${encodeURIComponent(clip.id)}/file`} aria-label={`${m.latestClip}: ${scene.title[locale]}`} onError={videoError} /></> : <p>{m.noClip}</p>}
    <form className="stack" onSubmit={(event) => void submit(event)}><label>{clip ? m.replaceClip : m.importClip}<span className="sr-only">{m.chooseClip}</span>
      <input key={inputKey} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" disabled={disabled} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <p className="muted">{m.uploadInfo}</p><button disabled={disabled || !file}>{m.upload}</button>
    </form>
  </article>;
}
export default function Workspace({ project, jobs, locale, m, disabled, operate, select, upload, download, retry, videoError }: Props) {
  const [choice, setChoice] = useState(project.selectedIdeaId ?? '');
  const selected = project.ideas.find((idea) => idea.id === project.selectedIdeaId);
  const active = jobs.some(isActive);
  const blocked = disabled || active;
  const pack = project.package;
  const currentClips = new Map<string, Clip>();
  for (const clip of project.clips) {
    const existing = currentClips.get(clip.sceneId);
    if (!existing || clip.createdAt > existing.createdAt) currentClips.set(clip.sceneId, clip);
  }
  const missing = pack?.scenes.filter((scene) => !currentClips.has(scene.id)) ?? [];
  const sections = ['brief', 'ideas', 'bibles', 'scenes', 'clips', 'preview'] as const;
  return <>
    <header className="page-heading"><div><span className="badge">{stageLabels[locale][project.status]}</span><h1>{project.name}</h1></div><a href="#stories">{m.stories}</a></header>
    <nav className="steps" aria-label={m.status}>{sections.map((section) => <a key={section} href={`#story/${encodeURIComponent(project.id)}${section === 'preview' ? '/preview' : `/${section}`}`}>{m[section]}</a>)}</nav>
    {active && <p className="notice" role="status">{m.activeJob}</p>}
    <section id="workspace-brief" className="card"><h2>{m.brief}</h2><p className="preserve">{project.brief}</p><dl className="details"><div><dt>{m.genre}</dt><dd>{project.genre}</dd></div><div><dt>{m.audience}</dt><dd>{project.audience}</dd></div><div><dt>{m.aspectRatio}</dt><dd>{project.aspectRatio}</dd></div></dl></section>
    <section id="workspace-ideas"><h2>{m.ideas}</h2><p>{m.ideasInfo}</p>
      {project.ideas.length === 0 ? <><p className="empty">{m.emptyIdeas}</p><button disabled={blocked} onClick={() => operate('ideas')}>{m.generateIdeas}</button></> : project.ideas.length !== 10 ? <p className="error" role="alert">{m.tenIdeasError}</p> : <>
        <fieldset disabled={blocked || !!pack}><legend>{m.ideaChoice}</legend><div className="card-grid ideas">{project.ideas.map((idea, index) => <label className={`card idea ${choice === idea.id ? 'chosen' : ''}`} key={idea.id}>
          <span className="idea-title"><input type="radio" name="idea" value={idea.id} checked={choice === idea.id} onChange={() => setChoice(idea.id)} /><strong>{index + 1}. {idea.title[locale]}</strong></span>
          <span>{idea.logline[locale]}</span><span><strong>{m.hook}:</strong> {idea.hook[locale]}</span>
          {project.selectedIdeaId === idea.id && <span className="badge">{m.savedSelection}</span>}
        </label>)}</div></fieldset>
        {!pack && <div className="actions"><button disabled={blocked || !choice || choice === project.selectedIdeaId} onClick={() => select(choice)}>{m.saveSelection}</button>{choice && choice !== project.selectedIdeaId && <span>{m.unsavedSelection}</span>}</div>}
      </>}
      {selected && <p><strong>{m.savedSelection}:</strong> {selected.title[locale]}</p>}
      {pack ? <p className="muted">{m.selectionLocked}</p> : <><p>{m.expandInfo}</p><button disabled={blocked || !selected} onClick={() => operate('expand')}>{m.expand}</button>{!selected && <p className="muted">{m.selectionNeeded}</p>}</>}
    </section>
    <section id="workspace-bibles"><h2>{m.bibles}</h2>{!pack ? <p className="empty">{m.emptyPackage}</p> : <div className="stack">
      <article className="card"><h3>{m.storyBible}</h3><p className="preserve">{pack.storyBible[locale]}</p></article>
      <h3>{m.characters}</h3><div className="card-grid">{pack.characters.map((character) => <article className="card" key={character.id}><h4>{character.name}</h4><p className="preserve">{character.background[locale]}</p><p><strong>{m.visualEn}:</strong></p><p lang="en">{character.visualDescriptionEn}</p></article>)}</div>
      <h3>{m.locations}</h3><div className="card-grid">{pack.locations.map((location) => <article className="card" key={location.id}><h4>{location.name[locale]}</h4><p className="preserve">{location.description[locale]}</p><p><strong>{m.visualEn}:</strong></p><p lang="en">{location.visualDescriptionEn}</p></article>)}</div>
      <article className="card"><h3>{m.continuity}</h3><ol>{pack.continuityRules.map((rule, index) => <li key={index}>{rule[locale]}</li>)}</ol></article>
    </div>}</section>
    <section id="workspace-scenes"><h2>{m.scenes}</h2><p>{m.flowInfo}</p><div className="actions"><a className="button secondary" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">{m.openFlow}</a><button disabled={disabled || !pack} onClick={() => download(`/projects/${encodeURIComponent(project.id)}/prompt-pack`, 'flow-prompt-pack.json')}>{m.downloadPack}</button></div>
      {!pack ? <p className="empty">{m.emptyPackage}</p> : <div className="stack">{pack.scenes.map((scene) => <article className="card" key={scene.id}>
        <h3>{scene.order}. {scene.title[locale]} · {scene.durationSeconds} {m.seconds}</h3>
        <p><strong>{m.characters}:</strong> {scene.characterIds.map((id) => pack.characters.find((character) => character.id === id)?.name ?? id).join(', ')}</p>
        <p><strong>{m.locations}:</strong> {pack.locations.find((location) => location.id === scene.locationId)?.name[locale] ?? scene.locationId}</p>
        <h4>{m.explanationTh}</h4><p lang="th" className="preserve">{scene.explanationTh}</p><h4>{m.narration}</h4><p>{scene.narration[locale]}</p>
        <h4>{m.flowPromptEn}</h4><p lang="en" className="prompt preserve">{scene.flowPromptEn}</p><CopyButton text={scene.flowPromptEn} m={m} />
      </article>)}</div>}
    </section>
    <section id="workspace-clips"><h2>{m.clips}</h2>{!pack ? <p className="empty">{m.noScenes}</p> : <>
      <div className="stack">{pack.scenes.map((scene) => <ClipImport key={scene.id} scene={scene} clip={currentClips.get(scene.id)} locale={locale} m={m} disabled={blocked} upload={upload} videoError={videoError} />)}</div>
      <div className="card"><h3>{m.autoEdit}</h3><p>{m.editInfo}</p>{missing.length > 0 ? <><h4>{m.missingClips}</h4><ul>{missing.map((scene) => <li key={scene.id}>{scene.order}. {scene.title[locale]}</li>)}</ul></> : <p>{m.allClips}</p>}
        <button disabled={blocked || missing.length > 0 || pack.scenes.length === 0} onClick={() => operate('export')}>{m.autoEdit}</button>
      </div>
    </>}</section>
    <section id="workspace-preview" className="card"><h2>{m.preview}</h2>{project.export ? <><video key={project.export.id} controls preload="metadata" src={`/api/exports/${encodeURIComponent(project.export.id)}/file`} aria-label={m.preview} onError={videoError} /><button disabled={disabled} onClick={() => download(`/exports/${encodeURIComponent(project.export!.id)}/file`, 'story.mp4')}>{m.downloadVideo}</button></> : <p className="empty">{m.emptyExport}</p>}</section>
    <section><h2>{m.queue}</h2><Jobs jobs={jobs} locale={locale} m={m} disabled={disabled} retry={retry} /></section>
  </>;
}
