import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { z } from 'zod';
import { ChabuCharacterInputSchema, ChabuCharacterSchema, ChabuEpisodeInputSchema, ChabuEpisodeSchema, ChabuManualStageSchema, ChabuProductInputSchema, ChabuProductSchema, ChabuStateSchema, type ChabuEpisode, type ChabuState } from '../shared/chabu';
import { StoryPackageSchema, type Locale } from '../shared/contracts';
import type { ImageAsset } from '../shared/production';
import { jsonBody, request } from './api';
import { chabuMessages, type ChabuMessages } from './chabu-i18n';
import { chabuExecutionStatus, type ChabuExecutionStatus } from '../shared/chabu-status';
import { CHABU_FLOW_ADAPTER, CHABU_META_ADAPTER } from '../shared/chabu';

const ImageAssetSchema = z.object({ id: z.uuid(), projectId: z.string(), originalName: z.string(), width: z.number(), height: z.number(), createdAt: z.iso.datetime() });
const ImageResponseSchema = z.object({ asset: ImageAssetSchema });
const ProductionImagesSchema = z.object({ state: z.object({ images: z.array(ImageAssetSchema).optional() }).optional() });
const ProductionScenesSchema = z.object({ scenes: z.array(z.object({ id: z.string(), promptEn: z.string(), imported: z.boolean() })) });
const ProjectPackageSchema = z.object({ project: z.object({ package: StoryPackageSchema.nullable() }) });
const LibraryProjectSchema = z.object({ project: z.object({ id: z.uuid() }) });
const CharacterResponseSchema = z.object({ character: ChabuCharacterSchema });
const ProductResponseSchema = z.object({ product: ChabuProductSchema });
const EpisodeResponseSchema = z.object({ episode: ChabuEpisodeSchema, project: z.object({ id: z.uuid() }).passthrough() });
const StageResponseSchema = z.object({ episode: ChabuEpisodeSchema });

type Props = { locale: Locale; csrf: string | null; disabled: boolean; onError: (error: unknown) => void; openStory: (id: string, section: string) => void; downloadFile: (path: string, name: string) => void };
type Preview = { scenes: z.infer<typeof ProductionScenesSchema>['scenes']; story: z.infer<typeof StoryPackageSchema> | null };

function lines(value: string): string[] { return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
function focusFirstInvalid(form: HTMLFormElement, issues: z.ZodIssue[]) {
  const name = String(issues[0]?.path[0] ?? '');
  const field = name === 'references' ? form.querySelector('.chabu-ref-picker input') : name ? form.elements.namedItem(name) : form.elements.namedItem('clipCount');
  if (field instanceof HTMLElement) field.focus();
}
function latestVersion<T extends { revision: number }>(versions: T[] | undefined): T | undefined {
  return versions?.reduce((latest, candidate) => candidate.revision > latest.revision ? candidate : latest);
}
function orderedVersions<T extends { revision: number }>(versions: T[] | undefined): T[] {
  return [...(versions ?? [])].sort((first, second) => second.revision - first.revision);
}
function prefillCharacter(event: MouseEvent<HTMLButtonElement>, name: string, description: string, rules: string) {
  const section = event.currentTarget.closest('section');
  const nameField = section?.querySelector('input[name="name"]');
  const descriptionField = section?.querySelector('textarea[name="descriptionEn"]');
  const rulesField = section?.querySelector('textarea[name="identityRules"]');
  if (nameField instanceof HTMLInputElement) nameField.value = name;
  if (descriptionField instanceof HTMLTextAreaElement) descriptionField.value = description;
  if (rulesField instanceof HTMLTextAreaElement) rulesField.value = rules;
}
function stageText(stage: ChabuEpisode['manualStage'], t: ReturnType<typeof chabuMessages>) {
  switch (stage) {
    case 'draft': return t.stageDraft;
    case 'awaiting_external_generation': return t.stageFlow;
    case 'awaiting_upload': return t.stageUpload;
    case 'cancelled': return t.stageCancelled;
  }
}
function executionText(stage: ChabuExecutionStatus, t: ChabuMessages) {
  if (stage === 'queued') return t.queued;
  if (stage === 'processing') return t.running;
  if (stage === 'completed') return t.completed;
  if (stage === 'failed') return t.failed;
  return stageText(stage, t);
}

export default function ChabuStudio({ locale, csrf, disabled, onError, openStory, downloadFile }: Props) {
  const t = chabuMessages(locale);
  const [data, setData] = useState<ChabuState | null>(null);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<keyof ChabuMessages | ''>('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploadedFileCount, setUploadedFileCount] = useState(0);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [characterId, setCharacterId] = useState('');
  const [productId, setProductId] = useState('');
  const [characterVersionId, setCharacterVersionId] = useState('');
  const [productVersionId, setProductVersionId] = useState('');
  const [characterRefs, setCharacterRefs] = useState<Record<string, string>>({});
  const [productRefs, setProductRefs] = useState<Record<string, string>>({});
  const [episodeName, setEpisodeName] = useState('');
  const [brief, setBrief] = useState('');
  const [clipCount, setClipCount] = useState(4);
  const [clipDuration, setClipDuration] = useState(10);
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const requestId = useRef(crypto.randomUUID());
  const lastEpisodeInput = useRef<string | null>(null);
  const pending = useRef(false);

  const load = useCallback(async (signal: AbortSignal, showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const raw = await request<unknown>('/chabu', { signal }, csrf);
      const next = ChabuStateSchema.parse(raw);
      if (signal.aborted) return;
      setData(next);
      setLoadError(false);
      setSelectedEpisodeId((current) => current && next.episodes.some((episode) => episode.id === current) ? current : next.episodes[0]?.id ?? '');
      if (next.libraryProjectId) {
        const result = ProductionImagesSchema.parse(await request<unknown>(`/projects/${encodeURIComponent(next.libraryProjectId)}/production`, { signal }, csrf));
        if (!signal.aborted) setImages(result.state?.images ?? []);
      } else setImages([]);
    } catch (cause) {
      if (!signal.aborted) { setLoadError(true); onError(cause); }
    } finally { if (showLoading && !signal.aborted) setLoading(false); }
  }, [csrf, onError]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => { await load(controller.signal, true); if (!controller.signal.aborted) timer = setTimeout(tick, 5000); };
    void tick();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [load]);

  const selectedEpisode = data?.episodes.find((episode) => episode.id === selectedEpisodeId);
  const selectedProjectId = selectedEpisode?.projectId;
  useEffect(() => {
    if (!selectedProjectId) { setPreview(null); return; }
    const controller = new AbortController();
    setPreviewFailed(false);
    setPreview(null);
    void (async () => {
      try {
        const [productionRaw, projectRaw] = await Promise.all([
          request<unknown>(`/projects/${encodeURIComponent(selectedProjectId)}/production`, { signal: controller.signal }, csrf),
          request<unknown>(`/projects/${encodeURIComponent(selectedProjectId)}`, { signal: controller.signal }, csrf),
        ]);
        const production = ProductionScenesSchema.parse(productionRaw);
        const project = ProjectPackageSchema.parse(projectRaw);
        if (!controller.signal.aborted) setPreview({ scenes: production.scenes, story: project.project.package });
      } catch (cause) {
        if (!controller.signal.aborted) { setPreviewFailed(true); onError(cause); }
      }
    })();
    return () => controller.abort();
  }, [csrf, onError, previewAttempt, selectedEpisodeId, selectedProjectId]);

  const orderedEpisodes = useMemo(() => data?.episodes ?? [], [data]);
  const activeJobs = data?.episodes.flatMap((episode) => episode.jobs).filter((job) => job.status === 'queued' || job.status === 'running') ?? [];
  const episodes = data?.episodes ?? [];
  const draftCount = episodes.filter((episode) => chabuExecutionStatus(episode) === 'draft').length;
  const awaitingFlowCount = episodes.filter((episode) => chabuExecutionStatus(episode) === 'awaiting_external_generation').length;
  const awaitingUploadCount = episodes.filter((episode) => chabuExecutionStatus(episode) === 'awaiting_upload').length;
  const completedCount = episodes.filter((episode) => episode.importedClips >= episode.input.clipCount).length;
  const importedClipCount = episodes.reduce((total, episode) => total + episode.importedClips, 0);
  const failedJobCount = episodes.flatMap((episode) => episode.jobs).filter((job) => job.status === 'failed').length;
  const currentCharacter = latestVersion(data?.characters.find((item) => item.id === characterId)?.versions);
  const currentProduct = latestVersion(data?.products.find((item) => item.id === productId)?.versions);

  async function run<T>(task: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
    if (pending.current || disabled) return undefined;
    pending.current = true; setWorking(true); setNotice(''); setNoticeIsError(false);
    const controller = new AbortController();
    try { const result = await task(controller.signal); await load(controller.signal); return result; }
    catch (cause) { onError(cause); setNotice('error'); setNoticeIsError(true); return undefined; }
    finally { pending.current = false; setWorking(false); }
  }

  async function ensureLibrary(signal: AbortSignal): Promise<string> {
    if (data?.libraryProjectId) return data.libraryProjectId;
    const raw = await request<unknown>('/chabu/library', { ...jsonBody({}), signal }, csrf);
    return LibraryProjectSchema.parse(raw).project.id;
  }

  async function recoverSavedEpisodes() {
    const recovered = await run(async (signal) => ChabuStateSchema.parse(await request<unknown>('/chabu/recover', { ...jsonBody({}), signal }, csrf)));
    if (recovered) setData(recovered);
  }

  async function uploadImages(event: FormEvent) {
    event.preventDefault();
    if (!imageFiles.length) return;
    if (images.length + imageFiles.length - uploadedFileCount > 50) { setNotice('capacityExceeded'); setNoticeIsError(true); return; }
    await run(async (signal) => {
      const libraryId = await ensureLibrary(signal);
      try {
        for (const [index, file] of imageFiles.entries()) {
          if (index < uploadedFileCount) continue;
          const body = new FormData(); body.append('image', file);
          ImageResponseSchema.parse(await request<unknown>(`/projects/${encodeURIComponent(libraryId)}/images`, { method: 'POST', body, signal }, csrf));
          if (signal.aborted) return;
          setUploadedFileCount(index + 1);
        }
      } catch (cause) {
        await load(signal);
        throw cause;
      }
      setImageFiles([]); setUploadedFileCount(0); setImageInputKey((key) => key + 1);
      await load(signal);
    });
  }

  function selectedReferences(values: Record<string, string>) {
    return Object.entries(values).filter(([, angle]) => !!angle.trim()).map(([assetId, angle]) => ({ assetId, angle: angle.trim() }));
  }

  async function saveCharacter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = ChabuCharacterInputSchema.safeParse({ name: form.get('name'), descriptionEn: form.get('descriptionEn'), identityRules: lines(String(form.get('identityRules') ?? '')), references: selectedReferences(characterRefs) });
    if (!result.success) { setNotice('validationError'); setNoticeIsError(true); focusFirstInvalid(event.currentTarget, result.error.issues); return; }
    const isNew = !characterId;
    const currentForm = event.currentTarget;
    await run(async (signal) => {
      await ensureLibrary(signal);
      const raw = await request<unknown>(isNew ? '/chabu/characters' : `/chabu/characters/${encodeURIComponent(characterId)}/versions`, { ...jsonBody(result.data), signal }, csrf);
      CharacterResponseSchema.parse(raw);
      setCharacterId(''); setCharacterRefs({}); currentForm.reset(); setNotice('saved'); setNoticeIsError(false);
    });
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = ChabuProductInputSchema.safeParse({ name: form.get('name'), model: form.get('model'), variant: form.get('variant'), descriptionEn: form.get('descriptionEn'), verifiedSpecifications: lines(String(form.get('verifiedSpecifications') ?? '')), unverifiedClaims: lines(String(form.get('unverifiedClaims') ?? '')), prohibitedClaims: lines(String(form.get('prohibitedClaims') ?? '')), identityRules: lines(String(form.get('identityRules') ?? '')), references: selectedReferences(productRefs), affiliateUrl: form.get('affiliateUrl') ?? '' });
    if (!result.success) { setNotice('validationError'); setNoticeIsError(true); focusFirstInvalid(event.currentTarget, result.error.issues); return; }
    const isNew = !productId;
    const currentForm = event.currentTarget;
    await run(async (signal) => {
      await ensureLibrary(signal);
      const raw = await request<unknown>(isNew ? '/chabu/products' : `/chabu/products/${encodeURIComponent(productId)}/versions`, { ...jsonBody(result.data), signal }, csrf);
      ProductResponseSchema.parse(raw);
      setProductId(''); setProductRefs({}); currentForm.reset(); setNotice('saved'); setNoticeIsError(false);
    });
  }

  async function createEpisode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const character = data?.characters.find((item) => item.id === characterId);
    const product = data?.products.find((item) => item.id === productId);
    const charVersion = character?.versions.find((version) => version.id === characterVersionId) ?? latestVersion(character?.versions);
    const productVersion = product?.versions.find((version) => version.id === productVersionId) ?? latestVersion(product?.versions);
    if (!charVersion?.references.length || !productVersion?.references.length) { setNotice('referencesRequired'); setNoticeIsError(true); return; }
    const inputValues = { name: episodeName, brief, characterId, characterVersionId: charVersion?.id, productId, productVersionId: productVersion?.id, clipCount, clipDurationSeconds: clipDuration, aspectRatio };
    const firstParse = ChabuEpisodeInputSchema.safeParse({ ...inputValues, requestId: requestId.current });
    if (!firstParse.success) { setNotice('validationError'); setNoticeIsError(true); focusFirstInvalid(event.currentTarget, firstParse.error.issues); return; }
    const fingerprint = JSON.stringify(inputValues);
    if (lastEpisodeInput.current && lastEpisodeInput.current !== fingerprint) requestId.current = crypto.randomUUID();
    lastEpisodeInput.current = fingerprint;
    const input = ChabuEpisodeInputSchema.parse({ ...inputValues, requestId: requestId.current });
    await run(async (signal) => {
      const raw = await request<unknown>('/chabu/episodes', { ...jsonBody(input), signal }, csrf);
      const created = EpisodeResponseSchema.parse(raw);
      requestId.current = crypto.randomUUID();
      lastEpisodeInput.current = null;
      setSelectedEpisodeId(created.episode.id); setEpisodeName(''); setBrief('');
    });
  }

  async function setStage(episode: ChabuEpisode, stage: ChabuEpisode['manualStage']) {
    await run(async (signal) => {
      const raw = await request<unknown>(`/chabu/episodes/${encodeURIComponent(episode.id)}/stage`, { ...jsonBody({ stage }), signal }, csrf);
      StageResponseSchema.parse(raw);
    });
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setNotice('copied'); setNoticeIsError(false); }
    catch { setNotice('copyFailed'); setNoticeIsError(true); }
  }

  if (loading && !data) return <section className="card" aria-busy="true"><h1>{t.title}</h1><p role="status">{t.loading}</p></section>;

  return <div className="chabu-page">
    <header className="page-heading chabu-heading"><div><span className="badge active">CHABU</span><h1>{t.title}</h1><p className="muted">{t.subtitle}</p></div><button className="secondary" type="button" disabled={disabled || working} onClick={() => { const controller = new AbortController(); void load(controller.signal); }}>{t.refresh}</button></header>
    <div className="notice" role="note"><div><strong>{t.localOnly}</strong><p>{t.safety}</p></div></div>
    <dl className="chabu-metrics" aria-label={t.counts}>
      <div className="chabu-metric"><dt>{t.characters}</dt><dd>{data ? new Intl.NumberFormat(locale).format(data.characters.length) : '—'}</dd></div><div className="chabu-metric"><dt>{t.products}</dt><dd>{data ? new Intl.NumberFormat(locale).format(data.products.length) : '—'}</dd></div><div className="chabu-metric"><dt>{t.episodes}</dt><dd>{data ? new Intl.NumberFormat(locale).format(data.episodes.length) : '—'}</dd></div><div className="chabu-metric"><dt>{t.jobs}</dt><dd>{data ? new Intl.NumberFormat(locale).format(activeJobs.length) : '—'}</dd></div>
      <div className="chabu-metric"><dt>{t.draftEpisodes}</dt><dd>{data ? new Intl.NumberFormat(locale).format(draftCount) : '—'}</dd></div><div className="chabu-metric"><dt>{t.awaitingFlowEpisodes}</dt><dd>{data ? new Intl.NumberFormat(locale).format(awaitingFlowCount) : '—'}</dd></div><div className="chabu-metric"><dt>{t.awaitingUploadEpisodes}</dt><dd>{data ? new Intl.NumberFormat(locale).format(awaitingUploadCount) : '—'}</dd></div><div className="chabu-metric"><dt>{t.completedEpisodes}</dt><dd>{data ? new Intl.NumberFormat(locale).format(completedCount) : '—'}</dd></div><div className="chabu-metric"><dt>{t.importedClips}</dt><dd>{data ? new Intl.NumberFormat(locale).format(importedClipCount) : '—'}</dd></div><div className="chabu-metric"><dt>{t.failedJobs}</dt><dd>{data ? new Intl.NumberFormat(locale).format(failedJobCount) : '—'}</dd></div>
    </dl>
    {loadError && <div className="alert" role="alert"><p>{t.loadError}</p><div className="actions"><button type="button" className="secondary" onClick={() => { const controller = new AbortController(); void load(controller.signal, true); }}>{t.retry}</button><button type="button" className="secondary" disabled={disabled || working} onClick={() => void recoverSavedEpisodes()}>{t.recoverEpisodes}</button></div></div>}
    <div className="chabu-grid">
      <section className="card stack"><header><h2>{t.character}</h2><p className="muted">{t.noIdentity}</p></header>
          <label>{t.existingCharacter}<select value={characterId} onChange={(event) => { const id = event.target.value; const version = latestVersion(data?.characters.find((item) => item.id === id)?.versions); setCharacterId(id); setCharacterVersionId(''); setCharacterRefs(Object.fromEntries((version?.references ?? []).map((reference) => [reference.assetId, reference.angle]))); }}><option value="">{t.createCharacter}</option>{(data?.characters ?? []).map((item) => { const version = latestVersion(item.versions); return <option key={item.id} value={item.id}>{version?.name} · v{version?.revision}</option>; })}</select></label>
        <p className="muted">{t.templateNote}</p><div className="actions"><button type="button" className="secondary" onClick={(event) => prefillCharacter(event, 'CHABU', 'Female black-and-white domestic shorthair; yellow-green eyes; pink nose; black markings on head and back; black tail.', 'Female domestic shorthair. Black-and-white coat; yellow-green eyes; pink nose; black markings on head and back; black tail. Actual proportions are unverified; check against owner-provided reference images before finalizing.')}>{t.templateChabu}</button><button type="button" className="secondary" onClick={(event) => prefillCharacter(event, 'CHABUNG', 'Female seal-point Siamese; blue-gray eyes; dark brown/black nose; dark facial mask.', 'Female seal-point Siamese. Blue-gray eyes; dark brown/black nose; dark facial mask. Actual proportions are unverified; check against owner-provided reference images before finalizing.')}>{t.templateChabung}</button></div>
        <form key={characterId || 'new-character'} className="form-grid" onSubmit={(event) => void saveCharacter(event)}>
          <label>{t.name}<input name="name" required maxLength={120} defaultValue={currentCharacter?.name ?? ''} /></label>
          <label className="full">{t.descriptionEn}<textarea name="descriptionEn" required rows={3} defaultValue={currentCharacter?.descriptionEn ?? ''} /></label>
          <label className="full">{t.identityRules}<textarea name="identityRules" required rows={3} defaultValue={currentCharacter?.identityRules.join('\n') ?? ''} /></label>
          <ReferencePicker images={images} values={characterRefs} setValues={setCharacterRefs} label={t.references} angleLabel={t.angles} emptyLabel={t.noImages} missingLabel={t.missingAsset} />
          <div className="full actions"><button disabled={disabled || working}>{characterId ? t.appendCharacterVersion : t.createCharacter}</button></div>
        </form>
        <VersionList versions={data?.characters.find((item) => item.id === characterId)?.versions ?? []} label={t.versionHistory} locale={locale} />
      </section>
      <section className="card stack"><header><h2>{t.product}</h2><p className="muted">{t.noIdentity}</p></header>
        <label>{t.existingProduct}<select value={productId} onChange={(event) => { const id = event.target.value; const version = latestVersion(data?.products.find((item) => item.id === id)?.versions); setProductId(id); setProductVersionId(''); setProductRefs(Object.fromEntries((version?.references ?? []).map((reference) => [reference.assetId, reference.angle]))); }}><option value="">{t.createProduct}</option>{(data?.products ?? []).map((item) => { const version = latestVersion(item.versions); return <option key={item.id} value={item.id}>{version?.name} · v{version?.revision}</option>; })}</select></label>
        <form key={productId || 'new-product'} className="form-grid" onSubmit={(event) => void saveProduct(event)}>
          <label>{t.name}<input name="name" required maxLength={120} defaultValue={currentProduct?.name ?? ''} /></label>
          <label>{t.model}<input name="model" maxLength={120} defaultValue={currentProduct?.model ?? ''} /></label>
          <label>{t.variant}<input name="variant" maxLength={120} defaultValue={currentProduct?.variant ?? ''} /></label>
          <label className="full">{t.descriptionEn}<textarea name="descriptionEn" required rows={3} defaultValue={currentProduct?.descriptionEn ?? ''} /></label>
          <label className="full">{t.verifiedSpecifications}<textarea name="verifiedSpecifications" rows={3} defaultValue={currentProduct?.verifiedSpecifications.join('\n') ?? ''} /></label>
          <label className="full">{t.unverifiedClaims}<textarea name="unverifiedClaims" rows={2} defaultValue={currentProduct?.unverifiedClaims.join('\n') ?? ''} /></label>
          <label className="full">{t.prohibitedClaims}<textarea name="prohibitedClaims" rows={2} defaultValue={currentProduct?.prohibitedClaims.join('\n') ?? ''} /></label>
          <label className="full">{t.identityRules}<textarea name="identityRules" required rows={3} defaultValue={currentProduct?.identityRules.join('\n') ?? ''} /></label>
          <label className="full">{t.affiliateUrl}<input name="affiliateUrl" type="url" maxLength={2000} defaultValue={currentProduct?.affiliateUrl ?? ''} /></label>
          <ReferencePicker images={images} values={productRefs} setValues={setProductRefs} label={t.references} angleLabel={t.angles} emptyLabel={t.noImages} missingLabel={t.missingAsset} />
          <div className="full actions"><button disabled={disabled || working}>{productId ? t.appendProductVersion : t.createProduct}</button></div>
        </form>
        <VersionList versions={data?.products.find((item) => item.id === productId)?.versions ?? []} label={t.versionHistory} locale={locale} />
      </section>
    </div>
    <section className="card stack">
      <header><h2>{t.library}</h2><p className="muted">{t.noIdentity}</p><p className="muted">{t.imageCount}: {data ? `${new Intl.NumberFormat(locale).format(images.length)} / 50` : '—'} · {t.storageUsageUnknown}</p></header>
      <form className="form-grid" onSubmit={(event) => void uploadImages(event)}>
        <label className="full">{t.uploadImages}<input key={imageInputKey} type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" multiple onChange={(event) => { setImageFiles(Array.from(event.target.files ?? [])); setUploadedFileCount(0); }} /></label>
        <div className="full actions"><button disabled={disabled || working || !imageFiles.length}>{t.uploadImages}</button></div>
      </form>
      {!images.length ? <p className="empty">{t.noImages}</p> : <ul className="chabu-images">{images.map((image) => <li className="card" key={image.id}><img src={`/api/projects/${encodeURIComponent(image.projectId)}/images/${encodeURIComponent(image.id)}/file`} alt={image.originalName} width={image.width} height={image.height} loading="lazy" /><p>{image.originalName} · {image.width} × {image.height}</p><button type="button" className="secondary" onClick={() => downloadFile(`/projects/${encodeURIComponent(image.projectId)}/images/${encodeURIComponent(image.id)}/file`, image.originalName)}>{t.downloadOriginal}</button></li>)}</ul>}
    </section>
    <section className="card stack">
      <h2>{t.episode}</h2>
      <p className="muted">{t.manualOnly}</p>
      <form className="form-grid" onSubmit={(event) => void createEpisode(event)}>
        <label>{t.episodeName}<input name="name" value={episodeName} onChange={(event) => setEpisodeName(event.target.value)} required maxLength={120} /></label>
        <label className="full">{t.brief}<textarea name="brief" value={brief} onChange={(event) => setBrief(event.target.value)} required minLength={10} maxLength={2000} rows={4} /></label>
        <label>{t.character}<select name="characterId" value={characterId} onChange={(event) => { const id = event.target.value; const version = latestVersion(data?.characters.find((item) => item.id === id)?.versions); setCharacterId(id); setCharacterVersionId(''); setCharacterRefs(Object.fromEntries((version?.references ?? []).map((reference) => [reference.assetId, reference.angle]))); }} required><option value="">—</option>{(data?.characters ?? []).map((item) => <option key={item.id} value={item.id}>{latestVersion(item.versions)?.name}</option>)}</select></label>
        <label>{t.characterVersion}<select name="characterVersionId" value={characterVersionId || latestVersion(data?.characters.find((item) => item.id === characterId)?.versions)?.id || ''} onChange={(event) => setCharacterVersionId(event.target.value)} required>{orderedVersions(data?.characters.find((item) => item.id === characterId)?.versions).map((version) => <option key={version.id} value={version.id}>v{version.revision} · {version.name}</option>)}</select></label>
        <label>{t.product}<select name="productId" value={productId} onChange={(event) => { const id = event.target.value; const version = latestVersion(data?.products.find((item) => item.id === id)?.versions); setProductId(id); setProductVersionId(''); setProductRefs(Object.fromEntries((version?.references ?? []).map((reference) => [reference.assetId, reference.angle]))); }} required><option value="">—</option>{(data?.products ?? []).map((item) => <option key={item.id} value={item.id}>{latestVersion(item.versions)?.name}</option>)}</select></label>
        <label>{t.productVersion}<select name="productVersionId" value={productVersionId || latestVersion(data?.products.find((item) => item.id === productId)?.versions)?.id || ''} onChange={(event) => setProductVersionId(event.target.value)} required>{orderedVersions(data?.products.find((item) => item.id === productId)?.versions).map((version) => <option key={version.id} value={version.id}>v{version.revision} · {version.name}</option>)}</select></label>
        <label>{t.clipCount}<input name="clipCount" type="number" min={3} max={12} value={clipCount} onChange={(event) => setClipCount(Number(event.target.value))} /></label>
        <label>{t.clipDuration}<input name="clipDurationSeconds" type="number" min={4} max={20} value={clipDuration} onChange={(event) => setClipDuration(Number(event.target.value))} /></label>
        <label className="full">{t.aspectRatio}<select value={aspectRatio} onChange={(event) => { const ratio = ChabuEpisodeInputSchema.shape.aspectRatio.safeParse(event.target.value); if (ratio.success) setAspectRatio(ratio.data); }}><option value="9:16">9:16</option><option value="16:9">16:9</option></select></label>
        <p className="full muted">{t.requestId}</p><div className="full actions"><button disabled={disabled || working || !data?.characters.length || !data.products.length}>{t.createEpisode}</button></div>
      </form>
      {notice && <p role={noticeIsError ? 'alert' : 'status'} className={noticeIsError ? 'alert' : 'notice'}>{t[notice]}</p>}
      <div className="actions"><a className="button" href={CHABU_FLOW_ADAPTER.url} target="_blank" rel="noopener noreferrer">{t.openFlow}</a><a className="button secondary" href={CHABU_META_ADAPTER.url} target="_blank" rel="noopener noreferrer">{t.openMetaAi}</a><span className="muted">{t.metaAssist}</span></div>
    </section>
    <section className="card stack">
      <h2>{t.current}</h2>
      {!orderedEpisodes.length ? <p className="empty">{t.noEpisodes}</p> : <>
        <label>{t.episode}<select value={selectedEpisodeId} onChange={(event) => setSelectedEpisodeId(event.target.value)}>{orderedEpisodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.input.name} · {episode.project.name}</option>)}</select></label>
        {selectedEpisode && <article className="chabu-episode card stack">
          <header className="page-heading"><div><h3>{selectedEpisode.input.name}</h3><span className="badge">{executionText(chabuExecutionStatus(selectedEpisode), t)}</span></div><button type="button" className="secondary" onClick={() => openStory(selectedEpisode.projectId, 'scenes')}>{t.openStory}</button></header>
          <p>{selectedEpisode.input.brief}</p><p className="muted">{selectedEpisode.character.name} v{selectedEpisode.character.revision} · {selectedEpisode.product.name} v{selectedEpisode.product.revision} · {selectedEpisode.importedClips} {t.clips}</p>
          <ReferenceList references={selectedEpisode.character.references} images={images} projectId={data?.libraryProjectId ?? null} label={`${t.character}: ${t.pinnedReferences}`} unavailableLabel={t.missingAsset} downloadLabel={t.downloadOriginal} downloadFile={downloadFile} />
          <ReferenceList references={selectedEpisode.product.references} images={images} projectId={data?.libraryProjectId ?? null} label={`${t.product}: ${t.pinnedReferences}`} unavailableLabel={t.missingAsset} downloadLabel={t.downloadOriginal} downloadFile={downloadFile} />
          <label>{t.setStage}<select value={selectedEpisode.manualStage} onChange={(event) => { const stage = ChabuManualStageSchema.safeParse(event.target.value); if (stage.success) void setStage(selectedEpisode, stage.data); }}><option value="draft">{t.stageDraft}</option><option value="awaiting_external_generation">{t.stageFlow}</option><option value="awaiting_upload">{t.stageUpload}</option><option value="cancelled">{t.stageCancelled}</option></select></label>
          <p className="muted">{t.promptPreview}</p>
          {previewFailed && <div className="alert" role="alert"><p>{t.loadError}</p><button type="button" className="secondary" onClick={() => setPreviewAttempt((attempt) => attempt + 1)}>{t.retry}</button></div>}
          {!preview && !previewFailed ? <p role="status">{t.loading}</p> : preview?.scenes.map((scene) => {
            const storyScene = preview.story?.scenes.find((item) => item.id === scene.id);
            return <section className="prompt-panel chabu-scene" key={scene.id}><h4>{storyScene ? `${storyScene.order}. ${storyScene.title[locale]}` : `${t.scenes} ${scene.id}`}</h4>{storyScene && <p lang="th">{storyScene.explanationTh}</p>}<label>{t.flowPrompt}<textarea readOnly rows={5} value={scene.promptEn} lang="en" /></label><button type="button" className="secondary" onClick={() => void copy(scene.promptEn)}>{t.copy}</button>{scene.imported && <span className="badge success">{t.clipImported}</span>}</section>;
          })}
          {selectedEpisode.jobs.length > 0 && <ul className="chabu-jobs">{selectedEpisode.jobs.map((job) => <li key={job.id}>{job.type === 'ideas' ? t.ideasJob : job.type === 'expand' ? t.expandJob : t.exportJob} · {job.status === 'queued' ? t.queued : job.status === 'running' ? t.running : job.status === 'completed' ? t.completed : t.failed} · {new Intl.NumberFormat(locale).format(job.progress)}%</li>)}</ul>}
        </article>}
      </>}
    </section>
  </div>;
}

function ReferencePicker({ images, values, setValues, label, angleLabel, emptyLabel, missingLabel }: { images: ImageAsset[]; values: Record<string, string>; setValues: (value: Record<string, string>) => void; label: string; angleLabel: string; emptyLabel: string; missingLabel: string }) {
  const unavailableIds = Object.keys(values).filter((assetId) => !images.some((image) => image.id === assetId));
  return <fieldset className="full chabu-ref-picker"><legend>{label}</legend>{!images.length && !unavailableIds.length ? <p className="muted">{emptyLabel}</p> : <>
    {images.map((image) => <div className="chabu-ref-row" key={image.id}>
    <label className="chabu-ref-check"><input type="checkbox" checked={Object.hasOwn(values, image.id)} onChange={(event) => setValues(event.target.checked ? { ...values, [image.id]: 'front' } : Object.fromEntries(Object.entries(values).filter(([key]) => key !== image.id)))} /><img src={`/api/projects/${encodeURIComponent(image.projectId)}/images/${encodeURIComponent(image.id)}/file`} alt="" width={56} height={56} loading="lazy" />{image.originalName}</label>
    {Object.hasOwn(values, image.id) && <label>{angleLabel}<input value={values[image.id]} onChange={(event) => setValues({ ...values, [image.id]: event.target.value })} required maxLength={100} /></label>}
    </div>)}
    {unavailableIds.map((assetId) => <div className="chabu-ref-row" key={assetId}>
      <label className="chabu-ref-check"><input type="checkbox" checked onChange={() => setValues(Object.fromEntries(Object.entries(values).filter(([key]) => key !== assetId)))} /><span className="muted">{missingLabel}: {assetId}</span></label>
      <label>{angleLabel}<input value={values[assetId]} onChange={(event) => setValues({ ...values, [assetId]: event.target.value })} required maxLength={100} /></label>
    </div>)}
  </>}</fieldset>;
}

function ReferenceList({ references, images, projectId, label, unavailableLabel, downloadLabel, downloadFile }: { references: Array<{ assetId: string; angle: string }>; images: ImageAsset[]; projectId: string | null; label: string; unavailableLabel: string; downloadLabel: string; downloadFile: Props['downloadFile'] }) {
  if (!references.length) return null;
  return <section className="chabu-pinned-refs"><h4>{label}</h4><ul>{references.map((reference) => {
    const image = images.find((item) => item.id === reference.assetId);
    const sourceProjectId = image?.projectId ?? projectId;
    return <li key={`${reference.assetId}:${reference.angle}`}>{image && sourceProjectId && <img src={`/api/projects/${encodeURIComponent(sourceProjectId)}/images/${encodeURIComponent(image.id)}/file`} alt={image.originalName} width={64} height={64} loading="lazy" />}<span>{image?.originalName ?? `${unavailableLabel}: ${reference.assetId}`} · {reference.angle}</span>{image && sourceProjectId && <button type="button" className="secondary" onClick={() => downloadFile(`/projects/${encodeURIComponent(sourceProjectId)}/images/${encodeURIComponent(image.id)}/file`, image.originalName)}>{downloadLabel}</button>}</li>;
  })}</ul></section>;
}

function VersionList({ versions, label, locale }: { versions: Array<{ id: string; revision: number; createdAt: string }>; label: string; locale: Locale }) {
  if (!versions.length) return null;
  return <details><summary>{label}</summary><ol className="chabu-versions">{versions.map((version) => <li key={version.id}>v{version.revision} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(version.createdAt))}</li>)}</ol></details>;
}
