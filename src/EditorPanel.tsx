import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Locale, Project } from '../shared/contracts';
import { EditorSettingsSchema, type AudioAsset, type EditorSettings, type ProductionState } from '../shared/production';
import { jsonBody, RequestError, request } from './api';
import { pt } from './production-i18n';

interface Props { project: Project; locale: Locale; csrf: string | null; disabled: boolean; onError: (error: unknown) => void; operate: () => void }
const base = EditorSettingsSchema.parse({});
const audioExtensions = /\.(mp3|wav|m4a|ogg)$/i;

export default function EditorPanel({ project, locale, csrf, disabled, onError, operate }: Props) {
  const [settings, setSettings] = useState<EditorSettings>(base); const [audio, setAudio] = useState<AudioAsset[]>([]); const [busy, setBusy] = useState(false); const [file, setFile] = useState<File | null>(null); const [loading, setLoading] = useState(true); const [loadFailed, setLoadFailed] = useState(false); const [validation, setValidation] = useState(false); const [saved, setSaved] = useState(false);
  const pending = useRef(false); const alive = useRef(false); const operations = useRef(new Set<AbortController>()); const onErrorRef = useRef(onError); onErrorRef.current = onError;
  const originalScenes = useMemo(() => project.package?.scenes ?? [], [project.package]);
  const orderedScenes = useMemo(() => { const map = new Map(originalScenes.map((scene) => [scene.id, scene])); return settings.sceneOrder.map((id) => map.get(id)).filter((scene): scene is NonNullable<typeof scene> => !!scene).concat(originalScenes.filter((scene) => !settings.sceneOrder.includes(scene.id))); }, [originalScenes, settings.sceneOrder]);
  const missingClips = originalScenes.filter((scene) => !project.clips.some((clip) => clip.sceneId === scene.id));
  const t = (key: keyof typeof import('./production-i18n').productionText.en) => pt(locale, key);
  const refresh = useCallback(async (signal?: AbortSignal) => request<{ state: ProductionState }>(`/projects/${encodeURIComponent(project.id)}/production`, { signal }, csrf), [project.id, csrf]);
  useEffect(() => {
    alive.current = true; pending.current = false; setBusy(false); const controller = new AbortController(); operations.current.add(controller); setLoading(true); setLoadFailed(false);
    void refresh(controller.signal).then((result) => { if (alive.current && !controller.signal.aborted) { setSettings(EditorSettingsSchema.parse(result.state.editor)); setAudio(result.state.audio); } }).catch((error) => { if (alive.current && !controller.signal.aborted) { setLoadFailed(true); onErrorRef.current(error); } }).finally(() => { operations.current.delete(controller); if (alive.current && !controller.signal.aborted) setLoading(false); });
    const currentOperations = operations.current;
    return () => { alive.current = false; currentOperations.forEach((operation) => operation.abort()); currentOperations.clear(); };
  }, [refresh]);
  const locked = disabled || loading || loadFailed || busy;
  async function persist(): Promise<boolean> {
    const parsed = EditorSettingsSchema.safeParse(settings); setValidation(!parsed.success);
    if (!parsed.success) { onErrorRef.current(new RequestError('INVALID_INPUT')); return false; }
    if (locked || pending.current || !alive.current) return false;
    const controller = new AbortController(); operations.current.add(controller); pending.current = true; setBusy(true); setSaved(false);
    try {
      const result = await request<{ state: ProductionState }>(`/projects/${encodeURIComponent(project.id)}/production`, { ...jsonBody({ editor: parsed.data }), signal: controller.signal }, csrf);
      if (!alive.current || controller.signal.aborted) return false;
      setSettings(EditorSettingsSchema.parse(result.state.editor)); setAudio(result.state.audio); setSaved(true); return true;
    } catch (error) { if (alive.current && !controller.signal.aborted) onErrorRef.current(error); return false; }
    finally { operations.current.delete(controller); pending.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  async function save(event: FormEvent) { event.preventDefault(); await persist(); }
  async function saveAndExport() { if (missingClips.length || locked || pending.current) return; if (await persist() && alive.current) operate(); }
  async function uploadAudio(event: FormEvent) {
    event.preventDefault(); if (!file || file.size > 32 * 1024 * 1024 || !audioExtensions.test(file.name)) { setValidation(true); onErrorRef.current(new RequestError('INVALID_INPUT')); return; }
    if (locked || pending.current || !alive.current) return;
    const body = new FormData(); body.append('audio', file); const controller = new AbortController(); operations.current.add(controller); pending.current = true; setBusy(true); setValidation(false);
    try {
      await request<{ asset: AudioAsset }>(`/projects/${encodeURIComponent(project.id)}/audio`, { method: 'POST', body, signal: controller.signal }, csrf);
      const refreshed = await refresh(controller.signal);
      if (alive.current && !controller.signal.aborted) { setAudio(refreshed.state.audio); setFile(null); }
    } catch (error) { if (alive.current && !controller.signal.aborted) onErrorRef.current(error); }
    finally { operations.current.delete(controller); pending.current = false; if (alive.current && !controller.signal.aborted) setBusy(false); }
  }
  function move(sceneId: string, offset: number) { const ids = orderedScenes.map((scene) => scene.id); const from = ids.indexOf(sceneId); const to = from + offset; if (to < 0 || to >= ids.length) return; [ids[from], ids[to]] = [ids[to], ids[from]]; setSettings({ ...settings, sceneOrder: ids }); setSaved(false); }
  return <div className="stack">{loading && <p className="notice" role="status">{t('loading')}</p>}{loadFailed && <p className="error" role="alert">{t('loadFailed')}</p>}
    <form className="card form-grid" noValidate onSubmit={(event) => void save(event)}><fieldset className="form-grid full" disabled={locked}><h2 className="full">{t('editor')}</h2>
      <label>{t('resolution')}<select value={settings.resolution} onChange={(e) => setSettings({ ...settings, resolution: e.target.value as EditorSettings['resolution'] })}><option value="720p">720p</option><option value="1080p">1080p</option></select></label>
      <label>{t('quality')}<select value={settings.quality} onChange={(e) => setSettings({ ...settings, quality: e.target.value as EditorSettings['quality'] })}>{(['draft','standard','high'] as const).map((v) => <option key={v} value={v}>{t(v)}</option>)}</select></label>
      <label>{t('transition')}<select value={settings.transition} onChange={(e) => setSettings({ ...settings, transition: e.target.value as EditorSettings['transition'] })}><option value="cut">{t('cut')}</option><option value="fade">{t('fade')}</option></select></label>
      <label>{t('clipVolume')} (0–2)<input type="number" min="0" max="2" step="0.1" value={settings.clipVolume} onChange={(e) => setSettings({ ...settings, clipVolume: Number(e.target.value) })} /></label>
      <label className="full"><input type="checkbox" checked={settings.normalizeAudio} onChange={(e) => setSettings({ ...settings, normalizeAudio: e.target.checked })} /> {t('normalize')}</label>
      <label>{t('music')}<select value={settings.musicAssetId ?? ''} onChange={(e) => setSettings({ ...settings, musicAssetId: e.target.value || null })}><option value="">—</option>{audio.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}</select></label>
      <label>{t('musicVolume')} (0–1)<input type="number" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={(e) => setSettings({ ...settings, musicVolume: Number(e.target.value) })} /></label>
      <label>{t('subtitles')}<select value={settings.subtitleLocale} onChange={(e) => setSettings({ ...settings, subtitleLocale: e.target.value as EditorSettings['subtitleLocale'] })}><option value="off">{t('off')}</option><option value="th">{t('languageThai')}</option><option value="en">{t('languageEnglish')}</option></select></label>
      <div className="full stack"><h3>{t('order')}</h3>{orderedScenes.map((scene, index) => <div className="actions" key={scene.id}><span>{index + 1}. {scene.title[locale]}</span><button type="button" className="secondary" disabled={index === 0} onClick={() => move(scene.id, -1)}>{t('up')}</button><button type="button" className="secondary" disabled={index === orderedScenes.length - 1} onClick={() => move(scene.id, 1)}>{t('down')}</button></div>)}</div>
      <div className="full stack"><h3>{t('effects')}</h3>{settings.soundEffects.map((effect, index) => <div className="form-grid" key={`${effect.assetId}:${index}`}>
        <label>{t('asset')}<select value={effect.assetId} onChange={(e) => { const rows = settings.soundEffects.slice(); rows[index] = { ...effect, assetId: e.target.value }; setSettings({ ...settings, soundEffects: rows }); }}><option value="">—</option>{audio.map((asset) => <option key={asset.id} value={asset.id}>{asset.originalName}</option>)}</select></label>
        <label>{t('sceneTarget')}<select value={effect.sceneId} onChange={(e) => { const rows = settings.soundEffects.slice(); rows[index] = { ...effect, sceneId: e.target.value }; setSettings({ ...settings, soundEffects: rows }); }}>{orderedScenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.title[locale]}</option>)}</select></label>
        <label>{t('volume')}<input type="number" min="0" max="2" step="0.1" value={effect.volume} onChange={(e) => { const rows = settings.soundEffects.slice(); rows[index] = { ...effect, volume: Number(e.target.value) }; setSettings({ ...settings, soundEffects: rows }); }} /></label>
        <button type="button" className="secondary" onClick={() => setSettings({ ...settings, soundEffects: settings.soundEffects.filter((_, i) => i !== index) })}>{t('remove')}</button>
      </div>)}<button type="button" className="secondary" disabled={settings.soundEffects.length >= 12 || !audio.length || !orderedScenes.length} onClick={() => setSettings({ ...settings, soundEffects: [...settings.soundEffects, { assetId: audio[0].id, sceneId: orderedScenes[0].id, volume: 1 }] })}>{t('addEffect')}</button></div>
      <div className="full actions"><button>{t('saveEditor')}</button><button type="button" className="secondary" disabled={missingClips.length > 0} onClick={() => void saveAndExport()}>{t('saveAndExport')}</button></div></fieldset>
      {validation && <p className="full error" role="alert">{t('validation')}</p>}{saved && <p className="full notice" role="status">{t('saveSuccess')}</p>}{missingClips.length > 0 && <p className="full notice" role="status">{t('missingClips')}: {missingClips.map((scene) => scene.title[locale]).join(', ')}</p>}
    </form>
    <section className="card stack"><h2>{t('audio')}</h2><form className="stack" noValidate onSubmit={(event) => void uploadAudio(event)}><fieldset className="stack" disabled={locked}><label>{t('audioUpload')}<input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,.mp3,.wav,.m4a,.ogg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label><div className="actions"><button disabled={!file}>{t('importAudio')}</button></div></fieldset>{validation && <p className="error" role="alert">{t('validation')}</p>}</form><ul>{audio.map((asset) => <li key={asset.id}>{asset.originalName} · {asset.durationSeconds.toFixed(1)} {t('seconds')}</li>)}</ul></section>
  </div>;
}
