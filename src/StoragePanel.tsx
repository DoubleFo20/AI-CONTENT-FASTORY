import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Locale, Project } from '../shared/contracts';
import { jsonBody, request, RequestError } from './api';

type Props = { project: Project; locale: Locale; csrf: string | null; disabled: boolean; onError: (error: unknown) => void };
type DriveStatus = { provider: 'google_drive'; configured: boolean; connected: boolean; state: 'not_configured' | 'disconnected' | 'connected' | 'failed' };
type Transfer = { id: string; mediaId: string; kind: 'clips' | 'exports' | 'audio' | 'images'; sceneId?: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress: number; bytes: number; totalBytes: number; errorCode: string | null; file?: { id: string; name: string; mimeType: string; size: number; verified?: boolean; md5Checksum?: string }; createdAt: string; updatedAt: string };
type Storage = { projectId: string; prepared: boolean; folders: null | { rootId: string; categories: { story: string; productReview: string; kidsToy: string; investment: string; sharedAssets: string; archives: string }; projectFolderId: string }; transfers: Transfer[]; summary: { total: number; active: number; completed: number; failed: number } };
type Production = { state?: { audio?: { id: string; originalName: string }[]; images?: { id: string; originalName: string; width: number; height: number; createdAt: string }[] } };
type ImageAsset = NonNullable<Production['state']>['images'] extends (infer T)[] | undefined ? T : never;
type MediaChoice = { kind: Transfer['kind']; mediaId: string; name: string; label: string };
type Words = { title: string; description: string; connect: string; connected: string; disconnected: string; unavailable: string; setup: string; setupSteps: string[]; prepare: string; prepared: string; refresh: string; loading: string; loadFailed: string; empty: string; transfers: string; ready: string; noMedia: string; upload: string; retry: string; uploading: string; queued: string; running: string; complete: string; failed: string; bytes: string; checksum: string; verified: string; localCache: string; authFailed: string; configFailed: string; tokenFailed: string; permissionFailed: string; quotaFailed: string; notFound: string; genericFailed: string; unavailableMedia: string };
const words: Record<Locale, Words> = {
  th: { title: 'Google Drive', description: 'ปลายทางหลักสำหรับสื่อของโปรเจกต์ ไฟล์ในเครื่องยังคงอยู่และจะไม่ถูกลบอัตโนมัติ', connect: 'เชื่อมต่อ Google Drive', connected: 'เชื่อมต่อแล้ว', disconnected: 'ยังไม่ได้เชื่อมต่อ', unavailable: 'Google Drive ยังไม่พร้อมใช้งาน โปรเจกต์ยังทำงานต่อได้', setup: 'แนวทางตั้งค่าฝั่งเซิร์ฟเวอร์', setupSteps: ['เปิดใช้ Google Drive API ใน Google Cloud', 'สร้าง OAuth web client และกำหนด scope drive.file', 'ตั้ง callback เป็น'], prepare: 'เตรียมโฟลเดอร์สำหรับโปรเจกต์', prepared: 'เตรียมโฟลเดอร์แล้ว', refresh: 'รีเฟรชสถานะ', loading: 'กำลังโหลดสถานะ…', loadFailed: 'โหลดสถานะพื้นที่จัดเก็บไม่สำเร็จ', empty: 'ยังไม่มีรายการโอนไฟล์', transfers: 'รายการโอนไฟล์', ready: 'ไฟล์พร้อมส่ง', noMedia: 'ยังไม่มีคลิป เสียง หรือไฟล์ส่งออกที่พร้อมส่ง', upload: 'ส่งไป Drive', retry: 'ลองส่งอีกครั้ง', uploading: 'กำลังส่ง', queued: 'รอคิว', running: 'กำลังทำงาน', complete: 'ส่งเสร็จแล้ว', failed: 'ส่งไม่สำเร็จ', bytes: 'ไบต์', checksum: 'ตรวจสอบไฟล์', verified: 'ยืนยัน checksum แล้ว', localCache: 'ไฟล์ในเครื่องยังคงอยู่', authFailed: 'การเชื่อมต่อหมดอายุ กรุณาเชื่อมต่อใหม่', configFailed: 'เซิร์ฟเวอร์ยังตั้งค่า Google Drive ไม่ครบ', tokenFailed: 'ไม่สามารถใช้สิทธิ์ Drive ได้ กรุณาเชื่อมต่อใหม่', permissionFailed: 'ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ Drive', quotaFailed: 'พื้นที่ Drive ไม่พอ กรุณาตรวจสอบพื้นที่ว่าง', notFound: 'ไม่พบไฟล์ต้นทาง กรุณารีเฟรชสถานะ', genericFailed: 'เกิดข้อผิดพลาดระหว่างส่งไฟล์ กรุณารีเฟรชแล้วลองอีกครั้ง', unavailableMedia: 'แหล่งไฟล์นี้ยังไม่พร้อมใช้งาน' },
  en: { title: 'Google Drive', description: 'Primary target for project media. Local files remain in place and are never deleted automatically.', connect: 'Connect Google Drive', connected: 'Connected', disconnected: 'Not connected', unavailable: 'Google Drive is unavailable. The project can continue working.', setup: 'Server setup guide', setupSteps: ['Enable Google Drive API in Google Cloud', 'Create an OAuth web client and use the drive.file scope', 'Set the callback to'], prepare: 'Prepare project folders', prepared: 'Folders prepared', refresh: 'Refresh status', loading: 'Loading storage status…', loadFailed: 'Could not load storage status', empty: 'No file transfers yet', transfers: 'File transfers', ready: 'Files ready to send', noMedia: 'No clips, audio, or exports are ready to send', upload: 'Send to Drive', retry: 'Retry transfer', uploading: 'Sending', queued: 'Queued', running: 'Running', complete: 'Sent', failed: 'Transfer failed', bytes: 'bytes', checksum: 'File verification', verified: 'Checksum verified', localCache: 'Local files remain in place', authFailed: 'The connection expired. Connect again.', configFailed: 'Google Drive is not fully configured on the server.', tokenFailed: 'Drive authorization is unavailable. Connect again.', permissionFailed: 'The account cannot access the Drive folder.', quotaFailed: 'Drive storage is full. Check available space.', notFound: 'The source file was not found. Refresh the status.', genericFailed: 'The transfer failed. Refresh and retry.', unavailableMedia: 'This media source is not available yet' },
};
const active = (transfer: Transfer) => transfer.status === 'queued' || transfer.status === 'running';
const friendlyError = (code: string | null, text: Words) => {
  if (!code) return text.genericFailed;
  const key = code.toUpperCase();
  if (/AUTH|TOKEN|CREDENTIAL|UNAUTH/.test(key)) return text.authFailed;
  if (/CONFIG|NOT_CONFIGURED/.test(key)) return text.configFailed;
  if (/PERMISSION|FORBIDDEN|ACCESS_DENIED/.test(key)) return text.permissionFailed;
  if (/QUOTA|STORAGE_FULL/.test(key)) return text.quotaFailed;
  if (/NOT_FOUND|FILE_MISSING/.test(key)) return text.notFound;
  if (/GRANT|INVALID_TOKEN/.test(key)) return text.tokenFailed;
  return text.genericFailed;
};
const fmtBytes = (bytes: number, locale: Locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes);

export default function StoragePanel({ project, locale, csrf, disabled, onError }: Props) {
  const t = words[locale];
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [choices, setChoices] = useState<MediaChoice[]>([]);
  const [images, setImages] = useState<ImageAsset[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const actionControllerRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);
  const activeRef = useRef(false);
  const projectRef = useRef(project);
  const onErrorRef = useRef(onError);
  projectRef.current = project;
  onErrorRef.current = onError;

  const load = useCallback(async (signal: AbortSignal) => {
    const projectId = encodeURIComponent(project.id);
    const [driveResult, storageResult, productionResult] = await Promise.all([
      request<{ storage: DriveStatus }>('/integrations/drive/status', { signal }),
      request<{ storage: Storage }>(`/projects/${projectId}/storage`, { signal }, csrf),
      request<Production>(`/projects/${projectId}/production`, { signal }, csrf).catch((error: unknown) => {
        if (signal.aborted) throw error;
        return { state: undefined } as Production;
      }),
    ]);
    if (signal.aborted || projectRef.current.id !== project.id) return;
    setDrive(driveResult.storage);
    setStorage(storageResult.storage);
    const currentProject = projectRef.current;
    const media: MediaChoice[] = currentProject.clips.map((clip) => ({ kind: 'clips', mediaId: clip.id, name: clip.originalName, label: `MP4 · ${clip.originalName}` }));
    if (currentProject.export) media.push({ kind: 'exports', mediaId: currentProject.export.id, name: 'export.mp4', label: locale === 'th' ? 'วิดีโอส่งออก · MP4' : 'Current export · MP4' });
    for (const item of productionResult.state?.audio ?? []) media.push({ kind: 'audio', mediaId: item.id, name: item.originalName, label: `${locale === 'th' ? 'เสียง' : 'Audio'} · ${item.originalName}` });
    for (const item of productionResult.state?.images ?? []) media.push({ kind: 'images', mediaId: item.id, name: item.originalName, label: `${locale === 'th' ? 'ภาพ' : 'Image'} · ${item.originalName}` });
    setChoices(media);
    setImages(productionResult.state?.images ?? []);
    activeRef.current = storageResult.storage.transfers.some(active);
    setLoadFailed(false);
    setMessage('');
  }, [project.id, locale, csrf]);

  useEffect(() => {
    pendingRef.current = false;
    actionControllerRef.current = null;
    setBusy(false);
    return () => {
      actionControllerRef.current?.abort();
      actionControllerRef.current = null;
      pendingRef.current = false;
    };
  }, [project.id]);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const tick = async () => {
      try {
        await load(controller.signal);
        if (!disposed && projectRef.current.id === project.id) setLoading(false);
      } catch (error) {
        if (!controller.signal.aborted && !disposed && projectRef.current.id === project.id) { setLoadFailed(true); setLoading(false); onErrorRef.current(error); }
      }
      if (!disposed && !controller.signal.aborted) {
        timer = setTimeout(tick, activeRef.current ? 3000 : 10000);
      }
    };
    setLoading(true);
    void tick();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [load, project.id]);

  const run = async (operation: (signal: AbortSignal) => Promise<void>) => {
    if (disabled || loading || pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    const controller = new AbortController();
    actionControllerRef.current?.abort();
    actionControllerRef.current = controller;
    try { await operation(controller.signal); }
    catch (error) { if (!controller.signal.aborted) { onError(error); setMessage(error instanceof RequestError && error.code === 'NETWORK_ERROR' ? t.genericFailed : t.genericFailed); } }
    finally {
      if (actionControllerRef.current === controller) {
        actionControllerRef.current = null;
        pendingRef.current = false;
        setBusy(false);
      }
    }
  };

  const connect = () => void run(async (signal) => {
    const result = await request<{ authorizationUrl: string }>('/integrations/drive/authorize', { ...jsonBody({}), signal }, csrf);
    if (signal.aborted) return;
    const url = new URL(result.authorizationUrl);
    if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw new Error('Invalid authorization destination');
    if (signal.aborted) return;
    window.location.assign(url.href);
  });

  const refresh = () => void run(async (signal) => {
    setLoadFailed(false); setLoading(true);
    try { await load(signal); }
    catch (error) { if (!signal.aborted) { setLoadFailed(true); onError(error); } }
    finally { if (!signal.aborted) setLoading(false); }
  });

  const prepare = () => void run(async (signal) => {
    const result = await request<{ storage: Storage }>(`/projects/${encodeURIComponent(project.id)}/storage/prepare`, { ...jsonBody({}), signal }, csrf);
    if (signal.aborted) return;
    setStorage(result.storage);
    setMessage(t.prepared);
  });

  const transfer = (choice: MediaChoice) => void run(async (signal) => {
    await request<{ transfer: Transfer }>(`/projects/${encodeURIComponent(project.id)}/storage/uploads`, { ...jsonBody({ kind: choice.kind, mediaId: choice.mediaId }), signal }, csrf);
    if (signal.aborted) return;
    setMessage(t.uploading);
    await load(signal);
  });

  const importImage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!imageFile) { onErrorRef.current(new RequestError('INVALID_MEDIA')); return; }
    if (imageFile.size === 0) { onErrorRef.current(new RequestError('INVALID_MEDIA')); return; }
    if (imageFile.size > 16 * 1024 * 1024) { onErrorRef.current(new RequestError('FILE_TOO_LARGE')); return; }
    if (!/\.(png|jpe?g|webp)$/i.test(imageFile.name)) { onErrorRef.current(new RequestError('INVALID_MEDIA')); return; }
    const form = event.currentTarget;
    void run(async (signal) => {
      const body = new FormData();
      body.append('image', imageFile);
      await request<{ asset: ImageAsset }>(`/projects/${encodeURIComponent(project.id)}/images`, { method: 'POST', body, signal }, csrf);
      if (signal.aborted || projectRef.current.id !== project.id) return;
      setImageFile(null);
      form.reset();
      await load(signal);
    });
  };

  const connected = drive?.configured === true && drive.connected === true;
  const busyState = disabled || busy || loading;
  const callbackUrl = typeof window === 'undefined' ? 'https://your-app-origin.example/api/integrations/drive/callback' : `${window.location.origin}/api/integrations/drive/callback`;
  return <section className="stack storage-panel" aria-labelledby="storage-title">
    <div className="card glass">
      <div className="page-heading"><div><h2 id="storage-title">{t.title}</h2><p className="muted">{t.description}</p></div>
        {connected ? <span className="badge success">{t.connected}</span> : <span className="badge">{drive?.configured ? t.disconnected : t.unavailable}</span>}
      </div>
      {drive?.configured && !connected && <div className="actions"><button type="button" disabled={busyState} onClick={connect}>{t.connect}</button></div>}
      {!drive?.configured && <div className="notice"><strong>{t.setup}</strong><ol>{t.setupSteps.map((step) => <li key={step}>{step}</li>)}<li><code>{callbackUrl}</code>{typeof window === 'undefined' && <span className="muted"> ({locale === 'th' ? 'ตัวอย่าง: แทนที่ด้วย origin ของแอปที่ติดตั้งจริง' : 'Example: replace with the deployed app origin'})</span>}</li></ol>
        <p>{locale === 'th' ? 'ตัวแปรสภาพแวดล้อมฝั่งเซิร์ฟเวอร์ (ระบุชื่อเท่านั้น):' : 'Server environment variable names:'} <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code>, <code>ACF_DRIVE_ALLOWED_REDIRECT_URIS</code>, <code>ACF_TOKEN_ENCRYPTION_KEY</code> (32-byte base64)</p></div>}
      {connected && <div className="stack"><div className="actions"><button type="button" disabled={busyState || storage?.prepared} onClick={prepare}>{storage?.prepared ? t.prepared : t.prepare}</button><button type="button" className="secondary" disabled={busyState} onClick={refresh}>{t.refresh}</button></div>
        {storage?.prepared && <p className="muted">{t.prepared} · {storage.summary.completed} / {storage.summary.total} {locale === 'th' ? 'รายการเสร็จแล้ว' : 'completed'} · {storage.summary.failed} {locale === 'th' ? 'รายการผิดพลาด' : 'failed'}</p>}
      </div>}
      {loading && <p className="muted" role="status">{t.loading}</p>}
      {loadFailed && <div className="alert" role="alert"><p>{t.loadFailed}</p><button type="button" className="secondary" disabled={busyState} onClick={refresh}>{t.refresh}</button></div>}
      {message && <p className="notice" role="status">{message}</p>}
      <p className="subdued">{t.localCache}</p>
    </div>
    {connected && <div className="card">
      <h3>{t.ready}</h3>
      {choices.length ? <ul>{choices.map((choice) => <li key={`${choice.kind}:${choice.mediaId}`} className="actions" style={{ justifyContent: 'space-between', marginBottom: 8 }}><span>{choice.label}</span><button type="button" disabled={busyState || !storage?.prepared || storage.transfers.some((item) => item.mediaId === choice.mediaId && active(item))} onClick={() => transfer(choice)}>{storage?.transfers.some((item) => item.mediaId === choice.mediaId && item.status === 'failed') ? t.retry : t.upload}</button></li>)}</ul> : <p className="muted">{t.noMedia}</p>}
      <h3>{t.transfers}</h3>
      {!storage?.transfers.length ? <p className="muted">{t.empty}</p> : <div className="stack">{storage.transfers.map((item) => <article className="card" key={item.id}>
        <div className="page-heading"><strong>{item.file?.name ?? choices.find((choice) => choice.mediaId === item.mediaId)?.name ?? item.mediaId}</strong><span className={`badge ${item.status === 'completed' ? 'success' : item.status === 'failed' ? 'error' : 'active'}`}>{item.status === 'queued' ? t.queued : item.status === 'running' ? t.running : item.status === 'completed' ? t.complete : t.failed}</span></div>
        {(item.status === 'queued' || item.status === 'running') && <div><progress max={100} value={item.progress} aria-label={`${t.uploading} ${item.progress}%`} /><p className="muted">{item.progress}% · {fmtBytes(item.bytes, locale)} / {fmtBytes(item.totalBytes, locale)} {t.bytes}</p></div>}
        {item.status === 'failed' && <p className="error">{friendlyError(item.errorCode, t)}</p>}
        {item.status === 'completed' && item.file?.verified === true && <p className="muted">{t.verified}</p>}
        {item.file && <p className="subdued">{item.file.mimeType} · {fmtBytes(item.file.size, locale)} {t.bytes}</p>}
      </article>)}</div>}
    </div>}
    <div className="card">
      <h3>{locale === 'th' ? 'ภาพอ้างอิงในเครื่อง' : 'Local reference images'}</h3>
      <p className="muted">{locale === 'th' ? 'นำเข้าภาพ PNG, JPG หรือ WebP ได้สูงสุด 16 MiB ภาพเดิมจะไม่ถูกเขียนทับ' : 'Import PNG, JPG, or WebP images up to 16 MiB. Existing images are never overwritten.'}</p>
      <form className="stack" noValidate onSubmit={importImage}>
        <label>{locale === 'th' ? 'เลือกภาพ' : 'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={busyState} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label>
        <div className="actions"><button type="submit" disabled={busyState || !imageFile}>{locale === 'th' ? 'นำเข้าภาพ' : 'Import image'}</button></div>
      </form>
      {images.length > 0 && <ul className="stack">{images.map((image) => <li key={image.id} className="card">
        <img src={`/api/projects/${encodeURIComponent(project.id)}/images/${encodeURIComponent(image.id)}/file`} alt={image.originalName} loading="lazy" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, objectFit: 'contain', marginBottom: 12 }} />
        <p>{image.originalName} · {image.width} × {image.height}</p><p className="subdued">{locale === 'th' ? 'รหัสอ้างอิง' : 'Reference ID'}: <code>{image.id}</code></p>
        {connected && <button type="button" disabled={busyState || !storage?.prepared || storage.transfers.some((item) => item.mediaId === image.id && active(item))} onClick={() => transfer({ kind: 'images', mediaId: image.id, name: image.originalName, label: image.originalName })}>{t.upload}</button>}
      </li>)}</ul>}
    </div>
  </section>;
}
