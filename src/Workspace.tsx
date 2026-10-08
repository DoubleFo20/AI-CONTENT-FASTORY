import { useState, type FormEvent } from 'react';
import type { Clip, Job, Locale, Project, Scene } from '../shared/contracts';
import { CopyButton, isActive } from './components';
import { stageLabels, type Messages } from './i18n';

type Operation = 'ideas' | 'expand' | 'export';
interface Props {
  project: Project; jobs: Job[]; locale: Locale; contentMode: 'th' | 'en' | 'th+en'; section?: string; m: Messages; disabled: boolean;
  operate: (operation: Operation) => void; select: (ideaId: string) => void;
  upload: (sceneId: string, file: File) => Promise<boolean>;
  download: (path: string, name: string) => void;
  videoError: () => void;
}

function DisplayText({ content, mode }: { content: Record<'th'|'en', string>; mode: 'th'|'en'|'th+en' }) {
  if (mode === 'th+en') {
    return <div className="th-en-group">
      <div><div className="lang-label">TH</div><span className="preserve">{content.th}</span></div>
      <div><div className="lang-label">EN</div><span className="preserve">{content.en}</span></div>
    </div>;
  }
  return <span className="preserve">{content[mode]}</span>;
}

function ClipImport({ scene, clip, locale, contentMode, m, disabled, upload, videoError }: { scene: Scene; clip: Clip | undefined; locale: Locale; contentMode: 'th'|'en'|'th+en'; m: Messages; disabled: boolean; upload: Props['upload']; videoError: Props['videoError'] }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (file && await upload(scene.id, file)) { setFile(null); setInputKey((key) => key + 1); }
  }
  return <article className="card"><h3>{scene.order}. <DisplayText content={scene.title} mode={contentMode} /></h3>
    {clip ? <><p><strong>{m.latestClip}</strong>: {clip.originalName} · {clip.durationSeconds.toFixed(1)} {m.seconds}</p>
      <video controls preload="none" src={`/api/clips/${encodeURIComponent(clip.id)}/file`} aria-label={`${m.latestClip}: ${scene.title[locale]}`} onError={videoError} /></> : <p>{m.noClip}</p>}
    <form className="stack" onSubmit={(event) => void submit(event)}><label>{clip ? m.replaceClip : m.importClip}<span className="sr-only">{m.chooseClip}</span>
      <input key={inputKey} type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" disabled={disabled} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <p className="muted">{m.uploadInfo}</p>
      <div className="actions"><button disabled={disabled || !file}>{m.upload}</button></div>
    </form>
  </article>;
}

export default function Workspace({ project, jobs, locale, contentMode, section, m, disabled, operate, select, upload, download, videoError }: Props) {
  const [choice, setChoice] = useState(project.selectedIdeaId ?? '');
  const [bibleTab, setBibleTab] = useState<'story'|'characters'|'locations'|'continuity'>('story');
  
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
  const activeSection = sections.includes(section as any) ? section : 'brief';

  return <>
    <header className="page-heading">
      <div>
        <span className="badge active">{stageLabels[locale][project.status]}</span>
        <h1 className="hero-title">{project.name}</h1>
      </div>
      <a className="button secondary" href="#stories">{m.stories}</a>
    </header>
    
    <nav className="workspace-nav" aria-label={m.status}>
      {sections.map((sec) => (
        <a key={sec} href={`#story/${encodeURIComponent(project.id)}/${sec}`} aria-current={activeSection === sec ? 'page' : undefined}>
          {m[sec]}
        </a>
      ))}
    </nav>
    
    {active && <p className="notice" role="status">{m.activeJob}</p>}
    
    {activeSection === 'brief' && <section id="workspace-brief" className="card">
      <h2>{m.brief}</h2><p className="preserve">{project.brief}</p>
      <dl className="details">
        <div><dt>{m.genre}</dt><dd>{project.genre}</dd></div>
        <div><dt>{m.audience}</dt><dd>{project.audience}</dd></div>
        <div><dt>{m.aspectRatio}</dt><dd>{project.aspectRatio}</dd></div>
      </dl>
    </section>}
    
    {activeSection === 'ideas' && <section id="workspace-ideas">
      <h2>{m.ideas}</h2><p className="muted">{m.ideasInfo}</p>
      {project.ideas.length === 0 ? <><div className="empty"><p>{m.emptyIdeas}</p></div><div className="actions"><button disabled={blocked} onClick={() => operate('ideas')}>{m.generateIdeas}</button></div></> : project.ideas.length !== 10 ? <p className="alert" role="alert">{m.tenIdeasError}</p> : <>
        <fieldset disabled={blocked || !!pack}>
          <legend>{m.ideaChoice}</legend>
          <div className="card-grid ideas">{project.ideas.map((idea, index) => <label className={`card idea ${choice === idea.id ? 'chosen' : ''}`} key={idea.id}>
            <div className="idea-title"><input type="radio" name="idea" value={idea.id} checked={choice === idea.id} onChange={() => setChoice(idea.id)} /><strong>{index + 1}. <DisplayText content={idea.title} mode={contentMode} /></strong></div>
            <div><DisplayText content={idea.logline} mode={contentMode} /></div>
            <div><strong>{m.hook}:</strong> <DisplayText content={idea.hook} mode={contentMode} /></div>
            {project.selectedIdeaId === idea.id && <div><span className="badge success">{m.savedSelection}</span></div>}
          </label>)}</div>
        </fieldset>
        {!pack && <div className="actions">
          <button disabled={blocked || !choice || choice === project.selectedIdeaId} onClick={() => select(choice)}>{m.saveSelection}</button>
          {choice && choice !== project.selectedIdeaId && <span className="muted">{m.unsavedSelection}</span>}
        </div>}
      </>}
      {selected && <div className="card" style={{marginTop: '24px'}}>
        <p><strong>{m.savedSelection}:</strong> <DisplayText content={selected.title} mode={contentMode} /></p>
        {pack ? <p className="muted">{m.selectionLocked}</p> : <>
          <p>{m.expandInfo}</p>
          <div className="actions">
            <button disabled={blocked || !selected} onClick={() => operate('expand')}>{m.expand}</button>
            {!selected && <span className="muted">{m.selectionNeeded}</span>}
          </div>
        </>}
      </div>}
    </section>}
    
    {activeSection === 'bibles' && <section id="workspace-bibles">
      <h2>{m.bibles}</h2>
      {!pack ? <div className="empty"><p>{m.emptyPackage}</p></div> : <div className="card">
        <div className="bible-tabs" role="tablist">
          <button role="tab" aria-selected={bibleTab === 'story'} className="bible-tab" onClick={() => setBibleTab('story')}>{m.storyBible}</button>
          <button role="tab" aria-selected={bibleTab === 'characters'} className="bible-tab" onClick={() => setBibleTab('characters')}>{m.characters}</button>
          <button role="tab" aria-selected={bibleTab === 'locations'} className="bible-tab" onClick={() => setBibleTab('locations')}>{m.locations}</button>
          <button role="tab" aria-selected={bibleTab === 'continuity'} className="bible-tab" onClick={() => setBibleTab('continuity')}>{m.continuity}</button>
        </div>
        
        {bibleTab === 'story' && <div>
          <DisplayText content={pack.storyBible} mode={contentMode} />
        </div>}
        
        {bibleTab === 'characters' && <div className="card-grid">
          {pack.characters.map((character) => <article className="card" key={character.id}>
            <h4>{character.name}</h4>
            <p><DisplayText content={character.background} mode={contentMode} /></p>
            <p className="muted"><strong>{m.visualEn}:</strong></p>
            <p lang="en">{character.visualDescriptionEn}</p>
          </article>)}
        </div>}
        
        {bibleTab === 'locations' && <div className="card-grid">
          {pack.locations.map((location) => <article className="card" key={location.id}>
            <h4><DisplayText content={location.name} mode={contentMode} /></h4>
            <p><DisplayText content={location.description} mode={contentMode} /></p>
            <p className="muted"><strong>{m.visualEn}:</strong></p>
            <p lang="en">{location.visualDescriptionEn}</p>
          </article>)}
        </div>}
        
        {bibleTab === 'continuity' && <div>
          <ol>{pack.continuityRules.map((rule, index) => <li key={index}><DisplayText content={rule} mode={contentMode} /></li>)}</ol>
        </div>}
      </div>}
    </section>}
    
    {activeSection === 'scenes' && <section id="workspace-scenes">
      <h2>{m.scenes}</h2>
      
      {!pack ? <div className="empty"><p>{m.emptyPackage}</p></div> : <>
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3>{m.reviewProductionPlan}</h3>
          <p className="muted">{m.flowInfo}</p>
          <p className="subdued">{m.estimateUnavailable}</p>
          <div className="actions">
            <a className="button" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">{m.confirmPlanAndOpenFlow}</a>
            <button className="secondary" disabled={disabled} onClick={() => download(`/projects/${encodeURIComponent(project.id)}/prompt-pack`, 'flow-prompt-pack.json')}>{m.downloadPack}</button>
          </div>
        </div>
        <div className="stack">{pack.scenes.map((scene) => <article className="card" key={scene.id}>
          <h3>{scene.order}. <DisplayText content={scene.title} mode={contentMode} /> · {scene.durationSeconds} {m.seconds}</h3>
          <p className="muted"><strong>{m.characters}:</strong> {scene.characterIds.map((id) => pack.characters.find((character) => character.id === id)?.name ?? id).join(', ')}</p>
          <p className="muted"><strong>{m.locations}:</strong> <DisplayText content={pack.locations.find((location) => location.id === scene.locationId)?.name ?? { th: scene.locationId, en: scene.locationId }} mode={contentMode} /></p>
          
          <h4 style={{marginTop: '16px'}}>{m.explanationTh}</h4>
          <p lang="th" className="preserve">{scene.explanationTh}</p>
          
          <h4 style={{marginTop: '16px'}}>{m.narration}</h4>
          <p><DisplayText content={scene.narration} mode={contentMode} /></p>
          
          <h4 style={{marginTop: '16px'}}>{m.flowPromptEn}</h4>
          <div className="prompt-panel">
            <p lang="en" className="preserve" style={{marginBottom: '16px'}}>{scene.flowPromptEn}</p>
            <CopyButton text={scene.flowPromptEn} m={m} />
          </div>
        </article>)}</div>
      </>}
    </section>}
    
    {activeSection === 'clips' && <section id="workspace-clips">
      <h2>{m.clips}</h2>
      {!pack ? <div className="empty"><p>{m.noScenes}</p></div> : <>
        <div className="stack">{pack.scenes.map((scene) => <ClipImport key={scene.id} scene={scene} clip={currentClips.get(scene.id)} locale={locale} contentMode={contentMode} m={m} disabled={blocked} upload={upload} videoError={videoError} />)}</div>
        <div className="card" style={{marginTop: '24px'}}>
          <h3>{m.autoEdit}</h3>
          <p className="muted">{m.editInfo}</p>
          {missing.length > 0 ? <>
            <h4 style={{marginTop: '16px'}}>{m.missingClips}</h4>
            <ul>{missing.map((scene) => <li key={scene.id}>{scene.order}. <DisplayText content={scene.title} mode={contentMode} /></li>)}</ul>
          </> : <p className="badge success" style={{marginBottom: '16px'}}>{m.allClips}</p>}
          <div className="actions">
            <button disabled={blocked || missing.length > 0 || pack.scenes.length === 0} onClick={() => operate('export')}>{m.autoEdit}</button>
          </div>
        </div>
      </>}
    </section>}
    
    {activeSection === 'preview' && <section id="workspace-preview">
      <h2>{m.preview}</h2>
      {project.export ? <div className="card">
        <video key={project.export.id} controls preload="metadata" src={`/api/exports/${encodeURIComponent(project.export.id)}/file`} aria-label={m.preview} onError={videoError} />
        <div className="actions">
          <button disabled={disabled} onClick={() => download(`/exports/${encodeURIComponent(project.export!.id)}/file`, 'story.mp4')}>{m.downloadVideo}</button>
        </div>
      </div> : <div className="empty"><p>{m.emptyExport}</p></div>}
    </section>}
  </>;
}
