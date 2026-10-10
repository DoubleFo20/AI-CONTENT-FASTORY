import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Locale, Project } from '../shared/contracts';
import { FlowSettingsSchema, SceneProductionSchema, type FlowSettings, type ProductionState, type SceneProduction } from '../shared/production';
import { jsonBody, RequestError, request } from './api';
import { CopyButton } from './components';
import { dictionaries } from './i18n';
import { pt } from './production-i18n';

interface Estimate { generations: number; estimatedCredits: number | null; budgetCredits: number | null; withinBudget: boolean | null; verifiedByOwner: boolean; spendsCredits: false }
export interface ProductionResponse { state: ProductionState; estimate: Estimate; scenes: { id: string; promptEn: string; imported: boolean }[] }
interface Props { project: Project; locale: Locale; csrf: string | null; disabled: boolean; onError: (error: unknown) => void; onUpdate?: (data: ProductionResponse) => void }
export type ClipMatcherProps = { project: Project; locale: Locale; csrf: string | null; disabled: boolean; onError: (error: unknown) => void; upload: (sceneId: string, file: File, signal?: AbortSignal) => Promise<boolean> };
const defaults: FlowSettings = { model: 'Google Flow', creditsPerGeneration: null, generationDurationSeconds: 8, budgetCredits: null, rateVerifiedByOwner: false };
const maxVideoBytes = 128 * 1024 * 1024;
const videoExtensions = /\.(mp4|webm|mov)$/i;
const fileKey = (file: File) => `${file.name}\u0000${file.lastModified}\u0000${file.size}`;

export function ClipMatcher({ project, locale, csrf, disabled, onError, upload }: ClipMatcherProps) {
  const [files, setFiles] = useState<File[]>([]); const [targets, setTargets] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [matching, setMatching] = useState(false); const [problem, setProblem] = useState(''); const [selectionVersion, setSelectionVersion] = useState(0);
  const filesRef = useRef(files); filesRef.current = files;
  const pending = useRef(false); const alive = useRef(false); const operations = useRef(new Set<AbortController>()); const onErrorRef = useRef(onError); onErrorRef.current = onError; const scenes = useMemo(() => project.package?.scenes ?? [], [project.package]);
  const sceneIdsKey = scenes.map((scene) => scene.id).join('\u0000'); const scenesById = useMemo(() => new Set(sceneIdsKey ? sceneIdsKey.split('\u0000') : []), [sceneIdsKey]); const scenesByIdRef = useRef(scenesById); scenesByIdRef.current = scenesById;
  const t = (key: keyof typeof import('./production-i18n').productionText.en) => pt(locale, key);
  useEffect(() => { alive.current = true; pending.current = false; setBusy(false); const currentOperations = operations.current; return () => { alive.current = false; pending.current = false; currentOperations.forEach((controller) => controller.abort()); currentOperations.clear(); }; }, [project.id, csrf]);
  useEffect(() => {
    const selectedFiles = filesRef.current;
    if (!selectedFiles.length) { setMatching(false); return; }
    const controller = new AbortController(); operations.current.add(controller); setMatching(true);
    void request<{ matches: { filename: string; sceneId: string | null }[] }>(`/projects/${encodeURIComponent(project.id)}/clip-match`, { ...jsonBody({ filenames: selectedFiles.map((file) => file.name) }), signal: controller.signal }, csrf)
      .then((result) => { if (!alive.current || controller.signal.aborted) return; setTargets((current) => { const next = { ...current }; for (const match of result.matches) { const key = selectedFiles.find((file) => file.name === match.filename); const token = key && fileKey(key); if (token && next[token] === undefined) next[token] = match.sceneId && scenesByIdRef.current.has(match.sceneId) ? match.sceneId : ''; } return next; }); })
      .catch((error) => { if (alive.current && !controller.signal.aborted) onErrorRef.current(error); })
      .finally(() => { operations.current.delete(controller); if (alive.current && !controller.signal.aborted) setMatching(false); });
    return () => { controller.abort(); };
  }, [selectionVersion, project.id, csrf]);
  const existing = new Set(project.clips.map((clip) => clip.sceneId));
  const validFiles = files.length > 0 && files.length <= 12 && files.every((file) => videoExtensions.test(file.name) && file.size <= maxVideoBytes) && new Set(files.map((file) => file.name.toLocaleLowerCase())).size === files.length;
  const chosen = files.map((file) => targets[fileKey(file)] ?? '');
  const targetsValid = chosen.every((id) => !!id && scenesById.has(id) && !existing.has(id)) && new Set(chosen).size === chosen.length;
  async function submit(event: FormEvent) {
    event.preventDefault(); if (pending.current || disabled || matching || !validFiles || !targetsValid || !alive.current) return;
    const controller = new AbortController(); operations.current.add(controller); pending.current = true; setBusy(true); setProblem('');
    try {
      for (const file of [...files]) {
        if (!alive.current || controller.signal.aborted) return;
        const sceneId = targets[fileKey(file)]; if (!sceneId) continue;
        const ok = await upload(sceneId, file, controller.signal); if (!alive.current || controller.signal.aborted) return;
        if (!ok) { setProblem(t('uploadError')); break; }
        setFiles((current) => { const next = current.filter((item) => fileKey(item) !== fileKey(file)); filesRef.current = next; return next; });
        setTargets((current) => { const next = { ...current }; delete next[fileKey(file)]; return next; });
      }
    } catch (error) { if (alive.current && !controller.signal.aborted) onErrorRef.current(error); }
    finally { operations.current.delete(controller); pending.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  return <form className="card stack" noValidate onSubmit={(event) => void submit(event)}><h2>{t('match')}</h2><fieldset disabled={disabled || busy || matching} className="stack">
    <label>{t('chooseFiles')}<input type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []); setProblem(''); if (selected.length > 12 || selected.some((file) => !videoExtensions.test(file.name) || file.size > maxVideoBytes)) { setFiles([]); filesRef.current = []; setTargets({}); setProblem(t('fileLimit')); } else if (new Set(selected.map((file) => file.name.toLocaleLowerCase())).size !== selected.length) { setFiles([]); filesRef.current = []; setTargets({}); setProblem(t('duplicates')); } else { setFiles(selected); filesRef.current = selected; setTargets({}); } setSelectionVersion((version) => version + 1); event.target.value = ''; }} /></label>
    {files.map((file) => <label key={fileKey(file)}>{file.name}<select value={targets[fileKey(file)] ?? ''} onChange={(event) => setTargets((current) => ({ ...current, [fileKey(file)]: event.target.value }))}><option value="">{t('unmatched')}</option>{scenes.map((scene) => <option key={scene.id} value={scene.id} disabled={existing.has(scene.id) || chosen.some((id) => id === scene.id && targets[fileKey(file)] !== id)}>{scene.order}. {scene.title[locale]}{existing.has(scene.id) ? ` — ${t('imported')}` : ''}</option>)}</select></label>)}
    {problem && <p role="alert" className="error">{problem}</p>}{matching && <p role="status" className="notice">{t('matching')}</p>}
    <div className="actions"><button disabled={!validFiles || !targetsValid || matching}>{busy ? t('uploading') : t('confirm')}</button></div></fieldset></form>;
}

export default function ProductionPanel({ project, locale, csrf, disabled, onError, onUpdate }: Props) {
  const [data, setData] = useState<ProductionResponse | null>(null); const [flow, setFlow] = useState<FlowSettings>(defaults); const [scenes, setScenes] = useState<Record<string, SceneProduction>>({}); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true); const [loadFailed, setLoadFailed] = useState(false); const [validation, setValidation] = useState(false); const [saved, setSaved] = useState(false);
  const pending = useRef(false); const alive = useRef(false); const operations = useRef(new Set<AbortController>()); const packScenes = useMemo(() => project.package?.scenes ?? [], [project.package]);
  const load = useCallback(async (signal: AbortSignal) => request<ProductionResponse>(`/projects/${encodeURIComponent(project.id)}/production`, { signal }, csrf), [project.id, csrf]);
  const apply = useCallback((result: ProductionResponse) => { setData(result); setFlow(result.state.flow); setScenes(result.state.scenes); onUpdate?.(result); }, [onUpdate]);
  const t = (key: keyof typeof import('./production-i18n').productionText.en) => pt(locale, key);
  useEffect(() => {
    alive.current = true; pending.current = false; setBusy(false); const controller = new AbortController(); operations.current.add(controller); setLoading(true); setLoadFailed(false);
    void load(controller.signal).then((result) => { if (alive.current && !controller.signal.aborted) apply(result); }).catch((error) => { if (alive.current && !controller.signal.aborted) { setLoadFailed(true); onError(error); } }).finally(() => { operations.current.delete(controller); if (alive.current && !controller.signal.aborted) setLoading(false); });
    const currentOperations = operations.current;
    return () => { alive.current = false; currentOperations.forEach((operation) => operation.abort()); currentOperations.clear(); };
  }, [load, apply, onError]);
  const scenesById = useMemo(() => new Map(packScenes.map((scene) => [scene.id, scene])), [packScenes]);
  async function save(payload: unknown) {
    if (disabled || loading || loadFailed || pending.current || !alive.current) return;
    const controller = new AbortController(); operations.current.add(controller); pending.current = true; setBusy(true); setSaved(false);
    try { await request(`/projects/${encodeURIComponent(project.id)}/production`, { ...jsonBody(payload), signal: controller.signal }, csrf); const refreshed = await load(controller.signal); if (alive.current && !controller.signal.aborted) { apply(refreshed); setSaved(true); } }
    catch (error) { if (alive.current && !controller.signal.aborted) onError(error); }
    finally { operations.current.delete(controller); pending.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  function field(sceneId: string, key: keyof SceneProduction, value: string) { setScenes((old) => ({ ...old, [sceneId]: { ...(old[sceneId] ?? { status: 'planned', notes: '', characterReference: '', locationReference: '' }), [key]: value } })); setSaved(false); }
  const locked = disabled || busy || loading || loadFailed || !data;
  return <div className="stack">{loading && <p className="notice" role="status">{t('loading')}</p>}{loadFailed && <p className="error" role="alert">{t('loadFailed')}</p>}
    <section className="card stack"><h2>{t('title')}</h2><p className="notice">{t('noSpend')}</p><form className="form-grid" noValidate onSubmit={(event) => { event.preventDefault(); const parsed = FlowSettingsSchema.safeParse(flow); setValidation(!parsed.success); if (!parsed.success) { onError(new RequestError('INVALID_INPUT')); return; } void save({ flow: parsed.data }); }}>
      <fieldset className="form-grid full" disabled={locked}><h3 className="full">{t('flow')}</h3><label className="full">{t('model')}<input maxLength={80} value={flow.model} onChange={(e) => setFlow({ ...flow, model: e.target.value })} /></label>
      <label>{t('rate')}<input type="number" min="0" max="10000" step="any" value={flow.creditsPerGeneration ?? ''} onChange={(e) => setFlow({ ...flow, creditsPerGeneration: e.target.value === '' ? null : Number(e.target.value) })} /></label><label>{t('duration')}<select value={flow.generationDurationSeconds} onChange={(e) => setFlow({ ...flow, generationDurationSeconds: Number(e.target.value) as 4|6|8 })}>{[4,6,8].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>{t('budget')}<input type="number" min="0" max="1000000" step="any" value={flow.budgetCredits ?? ''} onChange={(e) => setFlow({ ...flow, budgetCredits: e.target.value === '' ? null : Number(e.target.value) })} /></label><label className="full"><input type="checkbox" checked={flow.rateVerifiedByOwner} onChange={(e) => setFlow({ ...flow, rateVerifiedByOwner: e.target.checked })} /> {t('verified')}</label>
      {data && <div className="full notice">{t('generations')}: {data.estimate.generations} · {t('estimate')}: {data.estimate.estimatedCredits ?? t('unknown')} · {t('within')}: {data.estimate.withinBudget === null ? t('unknown') : data.estimate.withinBudget ? '✓' : '—'}</div>}
      <div className="full actions"><button disabled={locked}>{t('save')}</button><a className="button secondary" href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener noreferrer">{t('openFlow')}</a></div></fieldset>{validation && <p className="full error" role="alert">{t('validation')}</p>}{saved && <p className="full notice" role="status">{t('saveSuccess')}</p>}</form></section>
    {packScenes.map((scene) => { const state = scenes[scene.id] ?? { status: 'planned', notes: '', characterReference: '', locationReference: '' }; const meta = data?.scenes.find((item) => item.id === scene.id); return <article className="card stack" key={scene.id}><h3>{scene.order}. {scene.title[locale]}</h3><p lang="th" className="preserve">{scene.explanationTh}</p><label>{t('prompt')}<textarea readOnly rows={5} value={meta?.promptEn ?? scene.flowPromptEn} /></label><CopyButton text={meta?.promptEn ?? scene.flowPromptEn} m={dictionaries[locale]} />
      <fieldset className="stack" disabled={locked}><label>{t('status')}<select value={state.status} onChange={(e) => field(scene.id, 'status', e.target.value)}>{(['planned','ready_for_flow','generating','failed'] as const).map((status) => <option key={status} value={status}>{t(status)}</option>)}</select></label><label>{t('character')}<input maxLength={1000} value={state.characterReference} onChange={(e) => field(scene.id, 'characterReference', e.target.value)} /></label><label>{t('location')}<input maxLength={1000} value={state.locationReference} onChange={(e) => field(scene.id, 'locationReference', e.target.value)} /></label><label>{t('notes')}<textarea maxLength={2000} value={state.notes} onChange={(e) => field(scene.id, 'notes', e.target.value)} /></label>{meta?.imported && <span className="badge success">{t('imported')}</span>}
      <div className="actions"><button type="button" disabled={locked} onClick={() => { const parsed = SceneProductionSchema.safeParse(state); setValidation(!parsed.success); if (!parsed.success) onError(new RequestError('INVALID_INPUT')); else void save({ scenes: { [scene.id]: parsed.data } }); }}>{t('saveScene')}</button></div></fieldset></article>; })}
    {!scenesById.size && data && <p className="empty">{t('unknown')}</p>}
  </div>;
}
