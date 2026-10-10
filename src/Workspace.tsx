import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Clip, Job, Locale, Project, Scene } from '../shared/contracts';
import Modal from './Modal';
import { CopyButton, formatDate, isActive, JobDetails, WorkerStatus, type WorkerRuntimeStatus } from './components';
import { stageLabels, type Messages } from './i18n';
import type { AiRuntimeStatus } from '../shared/integrations';
import ProductionPanel, { ClipMatcher, type ProductionResponse } from './ProductionPanel';
import EditorPanel from './EditorPanel';
import StoragePanel from './StoragePanel';
import { RequestError } from './api';

type Operation = 'ideas' | 'expand' | 'export';
interface Props {
  project: Project; jobs: Job[]; locale: Locale; contentMode: 'th' | 'en' | 'th+en'; section?: string; m: Messages; disabled: boolean;
  operate: (operation: Operation) => void; select: (ideaId: string) => void;
  upload: (sceneId: string, file: File) => Promise<boolean>;
  download: (path: string, name: string) => void;
  videoError: () => void;
  ai: AiRuntimeStatus | null; modeBlocked: boolean;
  worker: WorkerRuntimeStatus | null;
  setAiMode: (mode: 'mock' | 'openai') => void;
  retry: (id: string) => void; cancel: (id: string) => void;
  csrf: string | null; onError: (error: unknown) => void;
}

function DisplayText({ content, mode }: { content: Record<'th'|'en', string>; mode: 'th'|'en'|'th+en' }) {
  if (mode === 'th+en') {
    return <div className="th-en-group">
      <div lang="th"><div className="lang-label">TH</div><span className="preserve">{content.th}</span></div>
      <div lang="en"><div className="lang-label">EN</div><span className="preserve">{content.en}</span></div>
    </div>;
  }
  return <span lang={mode} className="preserve">{content[mode]}</span>;
}

function ClipImport({ scene, clip, locale, contentMode, m, disabled, upload, videoError, onError }: { scene: Scene; clip: Clip | undefined; locale: Locale; contentMode: 'th'|'en'|'th+en'; m: Messages; disabled: boolean; upload: Props['upload']; videoError: Props['videoError']; onError: Props['onError'] }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) { onError(new RequestError('INVALID_MEDIA')); return; }
    if (file && await upload(scene.id, file)) { setFile(null); setInputKey((key) => key + 1); }
  }
  return <article className="card"><h3>{scene.order}. <DisplayText content={scene.title} mode={contentMode} /></h3>
    {clip ? <><p><strong>{m.latestClip}</strong>: {clip.originalName} · {clip.durationSeconds.toFixed(1)} {m.seconds}</p>
      <video controls preload="none" src={`/api/clips/${encodeURIComponent(clip.id)}/file`} aria-label={`${m.latestClip}: ${scene.title[locale]}`} onError={videoError} /></> : <p>{m.noClip}</p>}
    <form className="stack" noValidate onSubmit={(event) => void submit(event)}><label>{clip ? m.replaceClip : m.importClip}<span className="sr-only">{m.chooseClip}</span>
      <input key={inputKey} type="file" aria-label={`${clip ? m.replaceClip : m.importClip}: ${scene.order}. ${scene.title[locale]}`} accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" disabled={disabled} required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <p className="muted">{m.uploadInfo} · {m.fileSizeLimit}</p>
      <div className="actions"><button disabled={disabled || !file}>{m.upload}</button></div>
    </form>
  </article>;
}

export default function Workspace({ project, jobs, locale, contentMode, section, m, disabled, ai, worker, modeBlocked, setAiMode, retry, cancel, csrf, onError, operate, select, upload, download, videoError }: Props) {
  const [choice, setChoice] = useState(project.selectedIdeaId ?? '');
  const [bibleTab, setBibleTab] = useState<'story'|'characters'|'locations'|'continuity'>('story');

  const [reviewOpen, setReviewOpen] = useState(false);
  const [production, setProduction] = useState<ProductionResponse | null>(null);
  const updateProduction = useCallback((data: ProductionResponse) => setProduction(data), []);
  const bibleTabs = ['story', 'characters', 'locations', 'continuity'] as const;
  function navigateBible(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? bibleTabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % bibleTabs.length : event.key === 'ArrowLeft' ? (index + bibleTabs.length - 1) % bibleTabs.length : null;
    if (next === null) return;
    event.preventDefault(); setBibleTab(bibleTabs[next]);
    document.getElementById(`bible-tab-${bibleTabs[next]}`)?.focus();
  }
  const selected = project.ideas.find((idea) => idea.id === project.selectedIdeaId);
  const active = jobs.some(isActive);
  const blocked = disabled || active;
  const pack = project.package;
  const displayedChoice = pack ? project.selectedIdeaId : choice;

  const currentClips = new Map<string, Clip>();
  for (const clip of project.clips) {
    const existing = currentClips.get(clip.sceneId);
    if (!existing || clip.createdAt > existing.createdAt) currentClips.set(clip.sceneId, clip);
  }
  const missing = pack?.scenes.filter((scene) => !currentClips.has(scene.id)) ?? [];

  const sections = ['brief', 'ideas', 'bibles', 'scenes', 'clips', 'preview'] as const;
  const activeSection = sections.find((value) => value === section) ?? 'brief';
  const orderedJobs = [...jobs].sort((first, second) => second.createdAt.localeCompare(first.createdAt) || second.updatedAt.localeCompare(first.updatedAt));
  const latestJob = orderedJobs.find(isActive) ?? orderedJobs.find((job) => activeSection === 'brief' || (activeSection === 'ideas' ? job.type === 'ideas' || job.type === 'expand' : activeSection === 'bibles' || activeSection === 'scenes' ? job.type === 'expand' : job.type === 'export'));
  const quotaFailure = latestJob?.status === 'failed' && latestJob.errorCode === 'AI_QUOTA_EXCEEDED';
  const source = activeSection === 'ideas' ? project.generation?.ideas : project.generation?.expansion;

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

    {latestJob && <section className="workspace-job" aria-label={m.latestJob}>
      <h2>{m.latestJob}</h2>
      <WorkerStatus worker={worker} locale={locale} m={m} />
      <JobDetails job={latestJob} locale={locale} m={m} disabled={disabled} active={active} retry={retry} cancel={cancel} />
      {quotaFailure && <div className="notice quota-recovery">
        <p>{m.quotaRecovery}</p>
        {ai?.mode === 'mock' ? <p role="status">{m.mockSelected}</p> : <div className="actions"><button className="secondary" disabled={disabled || modeBlocked || !ai} onClick={() => setAiMode('mock')}>{m.useMockMode}</button></div>}
        {!ai && <p className="muted">{m.modeUnavailable}</p>}
        {modeBlocked && <p className="muted">{m.modeBlocked}</p>}
      </div>}
    </section>}
    {((activeSection === 'ideas' && project.ideas.length > 0) || ((activeSection === 'bibles' || activeSection === 'scenes') && pack)) && <p className="notice content-source"><strong>{m.resultSource}:</strong> {source === 'mock' ? m.sourceMock : source === 'openai' ? m.sourceOpenai : m.sourceUnknown}</p>}

    {activeSection === 'brief' && <section tabIndex={-1} id="workspace-brief" className="card glass">
      <h2>{m.brief}</h2><p className="preserve">{project.brief}</p>
      <dl className="details">
        <div><dt>{m.genre}</dt><dd>{project.genre}</dd></div>
        <div><dt>{m.audience}</dt><dd>{project.audience}</dd></div>
        <div><dt>{m.aspectRatio}</dt><dd>{project.aspectRatio}</dd></div>
      </dl>
      <h3>{m.nextStep}</h3>
      <a className="button" href={`#story/${encodeURIComponent(project.id)}/${project.export ? 'preview' : pack ? 'scenes' : 'ideas'}`}>{project.export ? m.preview : pack ? m.reviewPlan : selected ? m.expand : project.ideas.length ? m.ideaChoice : m.generateIdeas}</a>
    </section>}

    {activeSection === 'ideas' && <section tabIndex={-1} id="workspace-ideas">
      <h2>{m.ideas}</h2><p className="muted">{m.ideasInfo}</p>
      {project.ideas.length === 0 ? <><div className="empty"><p>{m.emptyIdeas}</p></div><div className="actions"><button disabled={blocked} onClick={() => operate('ideas')}>{m.generateIdeas}</button></div></> : project.ideas.length !== 10 ? <p className="alert" role="alert">{m.tenIdeasError}</p> : <>
        <fieldset disabled={blocked || !!pack}>
          <legend className="sr-only">{m.ideaChoice}</legend>
          <div className="card-grid ideas">{project.ideas.map((idea, index) => <label className="idea-card" key={idea.id}>
            <div className="idea-title" style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <input type="radio" name="idea" value={idea.id} checked={displayedChoice === idea.id} onChange={() => setChoice(idea.id)} style={{ marginTop: '4px' }} />
              <div>
                <strong><span className="subdued" style={{ marginRight: '8px' }}>{String(index + 1).padStart(2, '0')} / 10</span><DisplayText content={idea.title} mode={contentMode} /></strong>
              </div>
            </div>
            <div style={{ paddingLeft: '34px', marginBottom: '8px' }}><DisplayText content={idea.logline} mode={contentMode} /></div>
            <div className="small" style={{ paddingLeft: '34px' }}><span className="subdued">{m.hook}: </span> <DisplayText content={idea.hook} mode={contentMode} /></div>
            {project.selectedIdeaId === idea.id && <div style={{ paddingLeft: '34px', marginTop: '12px' }}><span className="chip">{m.savedSelection}</span></div>}
          </label>)}</div>
        </fieldset>
        {!pack && <div className="sticky-actions">
          <div>
            {project.selectedIdeaId === choice ? <p style={{ marginBottom: 0 }}><strong>{m.savedSelection}:</strong> <DisplayText content={selected!.title} mode={contentMode} /></p> : <p style={{ marginBottom: 0 }} className="muted">{m.unsavedSelection}</p>}
          </div>
          <div className="actions" style={{ display: 'flex', gap: '12px', marginTop: 0 }}>
            <button className="secondary" disabled={blocked || !choice || choice === project.selectedIdeaId} onClick={() => select(choice!)}>{m.saveSelection}</button>
          </div>
        </div>}
      </>}
      {selected && <div className="card" style={{marginTop: '24px'}}>
        <p><strong>{m.savedSelection}:</strong> <DisplayText content={selected.title} mode={contentMode} /></p>
        {pack ? <p className="muted">{m.selectionLocked}</p> : <>
          <p>{m.expandInfo}</p>
          <div className="actions">
            <button disabled={blocked || !selected || project.ideas.length !== 10} onClick={() => operate('expand')}>{m.expand}</button>
            {!selected && <span className="muted">{m.selectionNeeded}</span>}
          </div>
        </>}
      </div>}
    </section>}

    {activeSection === 'bibles' && <section tabIndex={-1} id="workspace-bibles">
      <h2>{m.bibles}</h2>
      {!pack ? <div className="empty"><p>{m.emptyPackage}</p><a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/ideas`}>{m.ideas}</a></div> : <div className="card glass">
        <div className="bible-tabs" role="tablist" aria-label={m.bibles}>
          {bibleTabs.map((tab, index) => <button key={tab} id={`bible-tab-${tab}`} type="button" role="tab" aria-controls="bible-panel" aria-selected={bibleTab === tab} tabIndex={bibleTab === tab ? 0 : -1} className="bible-tab" onClick={() => setBibleTab(tab)} onKeyDown={(event) => navigateBible(event, index)}>{tab === 'story' ? m.storyBible : m[tab]}</button>)}
        </div>
        <div id="bible-panel" role="tabpanel" aria-labelledby={`bible-tab-${bibleTab}`} tabIndex={0}>
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
        </div>
      </div>}
    </section>}

    {activeSection === 'scenes' && <section tabIndex={-1} id="workspace-scenes">
      <h2>{m.scenes}</h2>
      {pack && <ProductionPanel project={project} locale={locale} csrf={csrf} disabled={blocked} onError={onError} onUpdate={updateProduction} />}

      {!pack ? <div className="empty"><p>{m.emptyPackage}</p><a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/ideas`}>{m.ideas}</a></div> : <>
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3>{m.reviewProductionPlan}</h3>
          <p className="muted">{m.flowInfo}</p>
          <p className="subdued">{production?.estimate.estimatedCredits !== null && production?.estimate.estimatedCredits !== undefined ? `${production.estimate.estimatedCredits} ${m.credits}` : m.estimateUnavailable}</p>
          <div className="actions">
            <button type="button" disabled={active} onClick={() => setReviewOpen(true)}>{m.reviewPlan}</button>
            <button className="secondary" disabled={disabled} onClick={() => download(`/projects/${encodeURIComponent(project.id)}/prompt-pack`, 'flow-prompt-pack.json')}>{m.downloadPack}</button>
          </div>
        </div>
        <div className="stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>{pack.scenes.map((scene, i) => <article className="card" key={scene.id} style={{ padding: 0, overflow: 'hidden' }}>
          <div className={`scene-art ${i % 3 === 1 ? 'amber' : i % 3 === 2 ? 'violet' : ''}`}></div>
          <div style={{ padding: '24px' }}>
            <h3>{String(scene.order).padStart(2, '0')}. <DisplayText content={scene.title} mode={contentMode} /> · {scene.durationSeconds} {m.seconds}</h3>
            <p className="muted"><strong>{m.characters}:</strong> {scene.characterIds.map((id) => pack.characters.find((character) => character.id === id)?.name ?? id).join(', ')}</p>
            <p className="muted"><strong>{m.locations}:</strong> <DisplayText content={pack.locations.find((location) => location.id === scene.locationId)?.name ?? { th: scene.locationId, en: scene.locationId }} mode={contentMode} /></p>

            <div style={{ background: 'var(--surface-raised)', margin: '16px -24px -24px -24px', padding: '24px', borderTop: '1px solid var(--border)' }}>
              <h4>{m.explanationTh}</h4>
              <p lang="th" className="preserve muted">{scene.explanationTh}</p>

              <h4 style={{marginTop: '16px'}}>{m.narration}</h4>
              <p className="muted"><DisplayText content={scene.narration} mode={contentMode} /></p>

              <h4 style={{marginTop: '16px'}}>{m.flowPromptEn}</h4>
              <div className="prompt-panel">
                <p lang="en" className="preserve muted" style={{marginBottom: '16px'}}>{production?.scenes.find(item => item.id === scene.id)?.promptEn ?? scene.flowPromptEn}</p>
                <CopyButton text={production?.scenes.find(item => item.id === scene.id)?.promptEn ?? scene.flowPromptEn} m={m} />
              </div>
            </div>
          </div>
        </article>)}</div>
      </>}
    </section>}

    {activeSection === 'clips' && <section tabIndex={-1} id="workspace-clips">
      <h2>{m.clips}</h2>
      {!pack ? <div className="empty"><p>{m.noScenes}</p><a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/ideas`}>{m.ideas}</a></div> : <>
        <ClipMatcher project={project} locale={locale} csrf={csrf} disabled={blocked} onError={onError} upload={upload} />
        <EditorPanel project={project} locale={locale} csrf={csrf} disabled={blocked} onError={onError} operate={() => operate('export')} />
        <div className="stack">{pack.scenes.map((scene) => <ClipImport key={scene.id} scene={scene} clip={currentClips.get(scene.id)} locale={locale} contentMode={contentMode} m={m} disabled={blocked} upload={upload} videoError={videoError} onError={onError} />)}</div>
        <div className="card" style={{marginTop: '24px'}}>
          <h3>{m.autoEdit}</h3>
          <p className="muted">{m.editInfo}</p>
          <p>{m.aspectRatio}: {project.aspectRatio}</p>
          {missing.length > 0 ? <>
            <h4 style={{marginTop: '16px'}}>{m.missingClips}</h4>
            <ul>{missing.map((scene) => <li key={scene.id}>{scene.order}. <DisplayText content={scene.title} mode={contentMode} /></li>)}</ul>
          </> : <p className="badge success" style={{marginBottom: '16px'}}>{m.allClips}</p>}
          <div className="actions">
            {project.export && <a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/preview`}>{m.preview}</a>}
          </div>
        </div>
      </>}
      <StoragePanel project={project} locale={locale} csrf={csrf} disabled={blocked} onError={onError} />
    </section>}

    {activeSection === 'preview' && <section tabIndex={-1} id="workspace-preview">
      <h2>{m.preview}</h2>
      {project.export ? <div className="card">
        <video key={project.export.id} controls preload="none" src={`/api/exports/${encodeURIComponent(project.export.id)}/file`} aria-label={m.preview} onError={videoError} />
        <p>{m.aspectRatio}: {project.export.aspectRatio} · {m.updated}: {formatDate(project.export.createdAt, locale)}</p>
        <div className="actions">
          <button disabled={disabled} onClick={() => download(`/exports/${encodeURIComponent(project.export!.id)}/file`, 'story.mp4')}>{m.downloadVideo}</button>
        </div>
      </div> : <div className="empty"><p>{m.emptyExport}</p></div>}
      <StoragePanel project={project} locale={locale} csrf={csrf} disabled={blocked} onError={onError} />
    </section>}
    {reviewOpen && pack && <Modal title={m.reviewProductionPlan} closeLabel={m.closeDialog} onClose={() => setReviewOpen(false)}>
      {selected && <p><strong>{m.selectedIdeaSummary}:</strong> <DisplayText content={selected.title} mode={contentMode} /></p>}
      <p>{m.scene}: {pack.scenes.length} · {m.duration}: {pack.scenes.reduce((total, scene) => total + scene.durationSeconds, 0)} {m.seconds}</p>
      <p>{m.reviewSections}</p>
      <div className="actions"><a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/bibles`} onClick={() => setReviewOpen(false)}>{m.bibles}</a><a className="button secondary" href={`#story/${encodeURIComponent(project.id)}/scenes`} onClick={() => setReviewOpen(false)}>{m.scenes}</a></div>
      <p className="notice">{production?.estimate.estimatedCredits !== null && production?.estimate.estimatedCredits !== undefined ? `${production.estimate.estimatedCredits} ${m.credits}` : m.estimateUnavailable}</p>
      <p>{m.reviewAcknowledgment}</p>
      <p className="muted">{m.flowOpensExternally}</p>
      <div className="actions"><a className="button" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer" onClick={() => setReviewOpen(false)}>{m.confirmPlanAndOpenFlow}</a><button type="button" className="secondary" onClick={() => setReviewOpen(false)}>{m.cancel}</button></div>
    </Modal>}
  </>;
}
