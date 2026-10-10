import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDriveIntegration } from '../server/storage/drive.js';
import { TokenVault } from '../server/storage/vault.js';
import { DRIVE_SCOPE, DriveError, MAX_MULTIPART_BYTES, type DriveOptions, type DriveUpload, type DriveErrorCode } from '../server/storage/types.js';

const owner = 'c230af16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const otherOwner = 'd1caaf16-90fa-4b0d-8bd2-6fa6bfa8d9c4';
const project = { id: 'ad385bdc-e412-45fd-87ac-f31be55e7c8d', name: 'เรื่องเด็กกับร่ม' };
const folderMime = 'application/vnd.google-apps.folder';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const md5 = (value: Uint8Array) => createHash('md5').update(value).digest('hex');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const fails = (expected: DriveErrorCode) => (error: unknown) => {
  assert(error instanceof DriveError); assert.equal(error.code, expected); assert.equal(error.message, expected); return true;
};
interface RemoteFile {
  id: string; name: string; mimeType: string; parents: string[]; shared: boolean; trashed: boolean; driveId?: string;
  size?: string; md5Checksum?: string; appProperties: Record<string, string>;
}
function remoteDrive() {
  const files = new Map<string, RemoteFile>();
  const calls: Array<{ url: URL; method: string }> = [];
  const creates: RemoteFile[] = [];
  const uploadIds: string[] = [];
  const ranges: string[] = [];
  let generated = 0;
  let uploadAttributes: RemoteFile | null = null;
  let uploadedChunks: Uint8Array[] = [];
  const control: { loseFolderResponse?: boolean; loseUploadResponse?: boolean; failPut?: boolean; fakeNotFound?: boolean;
    listOverride?: (files: RemoteFile[]) => unknown; getOverride?: (file: RemoteFile) => RemoteFile; onUploadStart?: () => void } = {};
  const complete = (attributes: RemoteFile, bytes: Uint8Array) => {
    const file = { ...attributes, shared: false, trashed: false, size: String(bytes.byteLength), md5Checksum: md5(bytes) };
    files.set(file.id, file); creates.push(file); return file;
  };
  const fetchImpl: typeof fetch = async (url, init) => {
    const parsed = new URL(String(url)); const method = init?.method ?? 'GET';
    calls.push({ url: parsed, method });
    assert.equal(parsed.origin, 'https://www.googleapis.com'); assert.equal(init?.redirect, 'manual'); assert(init?.signal);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-access-token');
    if (parsed.pathname.endsWith('/generateIds')) { generated++; return json({ ids: [`generated_${generated}`], kind: 'drive#generatedIds', space: 'drive' }); }
    if (parsed.pathname === '/drive/v3/files' && method === 'GET') {
      assert.equal(parsed.searchParams.get('pageSize'), '2'); assert.equal(parsed.searchParams.get('corpora'), 'user');
      const query = parsed.searchParams.get('q')!;
      const key = query.match(/key='acfKey' and value='([a-f0-9]+)'/)![1];
      const ownerKey = query.match(/key='acfOwner' and value='([a-f0-9]+)'/)![1];
      const parent = query.match(/'([A-Za-z0-9_-]+)' in parents/)![1];
      const matching = [...files.values()].filter(file => file.appProperties.acfKey === key && file.appProperties.acfOwner === ownerKey && file.parents[0] === parent && !file.trashed);
      return json(control.listOverride?.(matching) ?? { files: matching });
    }
    if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
      const attributes = JSON.parse(String(init?.body)) as RemoteFile;
      assert(attributes.id); assert.equal(attributes.mimeType, folderMime); assert(!('permissions' in attributes));
      if (files.has(attributes.id)) return json({}, 409);
      const file = { ...attributes, shared: false, trashed: false }; files.set(file.id, file); creates.push(file);
      if (control.loseFolderResponse) { control.loseFolderResponse = false; throw new Error('private ambiguous folder response'); }
      return json(file);
    }
    if (parsed.pathname.startsWith('/drive/v3/files/')) {
      const id = parsed.pathname.split('/').at(-1)!;
      if (id === 'root') return json({ id: 'my_drive_root', name: 'My Drive', mimeType: folderMime, shared: false, trashed: false, parents: [], appProperties: {} });
      const file = files.get(id);
      if (!file) return json({}, 404);
      if (file.mimeType !== folderMime && control.fakeNotFound) { control.fakeNotFound = false; return json({}, 404); }
      return json(control.getOverride?.(file) ?? file);
    }
    assert.equal(parsed.pathname, '/upload/drive/v3/files');
    if (method === 'POST' && parsed.searchParams.get('uploadType') === 'resumable') {
      uploadAttributes = JSON.parse(String(init?.body)) as RemoteFile;
      uploadIds.push(uploadAttributes.id); control.onUploadStart?.();
      if (files.has(uploadAttributes.id)) return json({}, 409);
      uploadedChunks = [];
      return new Response(null, { headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=synthetic_session' } });
    }
    if (method === 'PUT') {
      assert(uploadAttributes); const bytes = new Uint8Array(await new Response(init?.body).arrayBuffer());
      ranges.push(new Headers(init?.headers).get('Content-Range')!);
      assert(bytes.byteLength <= 4 * 1024 * 1024);
      if (control.failPut) { control.failPut = false; throw new Error('private ambiguous chunk failure'); }
      uploadedChunks.push(bytes);
      const range = ranges.at(-1)!.match(/^bytes (\d+)-(\d+)\/(\d+)$/)!;
      const end = Number(range[2]) + 1; const total = Number(range[3]);
      if (end < total) return new Response(null, { status: 308, headers: { Range: `bytes=0-${end - 1}` } });
      const file = complete(uploadAttributes, Buffer.concat(uploadedChunks));
      if (control.loseUploadResponse) { control.loseUploadResponse = false; throw new Error('private ambiguous upload response'); }
      return json(file);
    }
    assert.equal(parsed.searchParams.get('uploadType'), 'multipart');
    const body = Buffer.from(await new Response(init?.body).arrayBuffer());
    const metadataStart = body.indexOf('\r\n\r\n') + 4;
    const metadataEnd = body.indexOf('\r\n--', metadataStart);
    const attributes = JSON.parse(body.subarray(metadataStart, metadataEnd).toString('utf8')) as RemoteFile;
    uploadIds.push(attributes.id); control.onUploadStart?.();
    if (files.has(attributes.id)) return json({}, 409);
    const mediaStart = body.indexOf('\r\n\r\n', metadataEnd) + 4;
    const file = complete(attributes, body.subarray(mediaStart, body.lastIndexOf('\r\n--')));
    if (control.loseUploadResponse) { control.loseUploadResponse = false; throw new Error('private ambiguous upload response'); }
    return json(file);
  };
  return { files, calls, creates, uploadIds, ranges, control, fetchImpl, get generated() { return generated; } };
}
async function fixture(t: TestContext) {
  const remote = remoteDrive();
  const base = join(process.cwd(), '.tmp'); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'drive-project-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const redirectUri = 'http://127.0.0.1:3001/api/integrations/drive/callback';
  const options: DriveOptions = { privateDir: join(directory, 'vault'), clientId: 'synthetic-client.apps.googleusercontent.com', clientSecret: 'synthetic-secret',
    redirectUri, allowedRedirectUris: [redirectUri], encryptionKey: randomBytes(32), fetchImpl: remote.fetchImpl, allowedFileRoots: [directory] };
  const vault = new TokenVault(options.privateDir, options.encryptionKey!);
  for (const id of [owner, otherOwner]) await vault.write(id, { accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token', expiresAt: Date.now() + 3600_000, scope: DRIVE_SCOPE });
  return { directory, options, remote, integration: createDriveIntegration(options) };
}
const upload = (bytes = new Uint8Array([1, 2, 3])) => ({ name: 'scene_1__media_1.mp4', mimeType: 'video/mp4', bytes, project, idempotencyKey: 'media_1' });

test('explicit project preparation creates the six private categories and one UUID-suffixed Story project once', async t => {
  const f = await fixture(t);
  const first = await f.integration.ensureProjectFolders!(owner, project.id, project.name);
  assert.equal(f.remote.creates.length, 8);
  assert.deepEqual(f.remote.creates.map(file => file.name), ['AI-CONTENT-FACTORY', 'AI Story', 'Product Review', 'Kids & Toy', 'Investment', 'Shared Assets', 'Archives', `${project.name}__${project.id}`]);
  assert.equal(f.remote.files.get(first.projectFolderId)?.parents[0], first.categories.story);
  for (const file of f.remote.creates) {
    assert.equal(file.appProperties.acfOwner, hash(owner)); assert.equal(file.appProperties.acfManaged, '1');
    assert.equal(file.shared, false); assert.equal(file.trashed, false); assert.equal(file.mimeType, folderMime);
  }
  assert.deepEqual(await f.integration.ensureProjectFolders!(owner, project.id, project.name), first);
  assert.equal(f.remote.creates.length, 8);
  const restart = createDriveIntegration(f.options);
  assert.deepEqual(await restart.ensureProjectFolders!(owner, project.id, project.name), first);
  assert.equal(f.remote.generated, 8);
  const importedOptions = { ...f.options, privateDir: join(f.directory, 'another-vault') };
  await new TokenVault(importedOptions.privateDir, importedOptions.encryptionKey!).write(owner,
    { accessToken: 'synthetic-access-token', expiresAt: Date.now() + 3600_000, scope: DRIVE_SCOPE });
  assert.deepEqual(await createDriveIntegration(importedOptions).ensureProjectFolders!(owner, project.id, project.name), first);
  assert.equal(f.remote.generated, 8); assert.equal(f.remote.creates.length, 8);
  const files = await readdir(join(f.options.privateDir, 'receipts'));
  for (const file of files) {
    const stored = await readFile(join(f.options.privateDir, 'receipts', file), 'utf8');
    assert(!stored.includes(owner)); assert(!stored.includes(project.name)); assert(!stored.includes('generated_'));
  }
});

test('owners cannot reuse each other’s managed folder tree or idempotent binary', async t => {
  const f = await fixture(t);
  const first = await f.integration.upload(owner, upload());
  const second = await f.integration.upload(otherOwner, upload());
  assert.notEqual(first.id, second.id);
  assert.equal(f.remote.files.get(first.id)?.appProperties.acfOwner, hash(owner));
  assert.equal(f.remote.files.get(second.id)?.appProperties.acfOwner, hash(otherOwner));
  assert.notDeepEqual(f.remote.files.get(first.id)?.parents, f.remote.files.get(second.id)?.parents);
  assert.equal(f.remote.creates.filter(file => file.mimeType === folderMime).length, 16);
});

test('ambiguous folder creation is reconciled by its durable preallocated ID after restart', async t => {
  const f = await fixture(t); f.remote.control.loseFolderResponse = true;
  await assert.rejects(f.integration.ensureProjectFolders!(owner, project.id, project.name), fails('DRIVE_REQUEST_FAILED'));
  assert.equal(f.remote.creates.length, 1);
  const restart = createDriveIntegration(f.options);
  await restart.ensureProjectFolders!(owner, project.id, project.name);
  assert.equal(f.remote.creates.length, 8); assert.equal(f.remote.generated, 8);
});

test('duplicate/incomplete lookup fails closed without creating another folder', async t => {
  for (const kind of ['duplicate', 'pagination', 'incomplete'] as const) {
    const f = await fixture(t);
    f.remote.control.listOverride = () => kind === 'duplicate' ? { files: [1, 2].map(index => ({ id: `dup_${index}`, name: 'AI-CONTENT-FACTORY', mimeType: folderMime,
      parents: ['my_drive_root'], shared: false, trashed: false, appProperties: { acfOwner: hash(owner), acfManaged: '1', acfKey: hash('folder:root') } })) } :
      kind === 'pagination' ? { files: [], nextPageToken: 'more' } : { files: [], incompleteSearch: true };
    await assert.rejects(f.integration.ensureProjectFolders!(owner, project.id, project.name), fails('DRIVE_INVALID_OUTPUT'));
    assert.equal(f.remote.creates.length, 0); assert.equal(f.remote.generated, 0);
  }
});

test('private ownership, parent lineage, trash and Shared Drive checks reject changed project folders', async t => {
  const f = await fixture(t);
  const folders = await f.integration.ensureProjectFolders!(owner, project.id, project.name);
  const folder = f.remote.files.get(folders.projectFolderId)!;
  for (const override of [{ shared: true }, { trashed: true }, { driveId: 'shared_drive' }, { parents: ['unrelated_parent'] }, { appProperties: { ...folder.appProperties, acfOwner: hash(otherOwner) } }]) {
    f.remote.control.getOverride = file => file.id === folder.id ? { ...file, ...override } : file;
    await assert.rejects(f.integration.upload(owner, upload()), fails('DRIVE_ACCESS_DENIED'));
    assert.equal(f.remote.uploadIds.length, 0);
  }
});

test('managed multipart verifies metadata GET checksum, reports progress, and reuses the same file for explicit retry', async t => {
  const f = await fixture(t); const progress: Array<[number, number]> = [];
  const result = await f.integration.upload(owner, { ...upload(), onProgress: (bytes, total) => progress.push([bytes, total]) });
  assert.equal(result.verified, true); assert.equal(result.md5Checksum, md5(new Uint8Array([1, 2, 3])));
  assert.deepEqual(progress, [[0, 3], [3, 3]]);
  assert.equal(f.remote.calls.at(-1)?.url.pathname, `/drive/v3/files/${result.id}`);
  assert.equal(f.remote.uploadIds.length, 1);
  const retry = await createDriveIntegration(f.options).upload(owner, upload());
  assert.deepEqual(retry, result); assert.equal(f.remote.uploadIds.length, 1);
  await assert.rejects(f.integration.upload(owner, { ...upload(), bytes: new Uint8Array([4, 5, 6]) }), fails('DRIVE_INVALID_INPUT'));
  assert.equal(f.remote.uploadIds.length, 1);
});

test('lost upload response and an indeterminate 404/409 retry cannot duplicate the remote binary', async t => {
  const f = await fixture(t); f.remote.control.loseUploadResponse = true;
  await assert.rejects(f.integration.upload(owner, upload()), fails('DRIVE_REQUEST_FAILED'));
  assert.equal(f.remote.uploadIds.length, 1);
  const firstId = f.remote.uploadIds[0];
  f.remote.control.fakeNotFound = true;
  const retry = await createDriveIntegration(f.options).upload(owner, upload());
  assert.equal(retry.id, firstId); assert.equal(retry.verified, true);
  assert.deepEqual(f.remote.uploadIds, [firstId, firstId]);
  assert.equal(f.remote.creates.filter(file => file.mimeType !== folderMime).length, 1);
});

test('incorrect or missing final checksum/size/private metadata never reports verified completion', async t => {
  for (const override of [{ md5Checksum: '0'.repeat(32) }, { md5Checksum: undefined }, { size: '4' }, { shared: true }, { parents: ['unrelated_parent'] }]) {
    const f = await fixture(t); const progress: number[] = [];
    f.remote.control.getOverride = file => file.mimeType === folderMime ? file : { ...file, ...override };
    await assert.rejects(f.integration.upload(owner, { ...upload(), onProgress: bytes => progress.push(bytes) }),
      fails('parents' in override ? 'DRIVE_ACCESS_DENIED' : 'DRIVE_INVALID_OUTPUT'));
    assert.deepEqual(progress, [0]); assert.equal(f.remote.uploadIds.length, 1);
  }
});

test('resumable verifies source bytes in 4MiB chunks, emits acknowledged progress, and never retries a failed chunk automatically', async t => {
  const f = await fixture(t); const bytes = new Uint8Array(MAX_MULTIPART_BYTES + 123); bytes.fill(19);
  const filename = join(f.directory, 'managed.mp4'); await writeFile(filename, bytes);
  const progress: number[] = [];
  const request: DriveUpload = { ...upload(), bytes: undefined, filePath: filename, onProgress: value => progress.push(value) };
  const result = await f.integration.upload(owner, request);
  assert.equal(result.md5Checksum, md5(bytes)); assert.equal(result.verified, true);
  assert.deepEqual(progress, [0, 4 * 1024 * 1024, bytes.length]);
  assert.deepEqual(f.remote.ranges, [`bytes 0-4194303/${bytes.length}`, `bytes 4194304-${bytes.length - 1}/${bytes.length}`]);
  const failing = await fixture(t); failing.remote.control.failPut = true;
  await assert.rejects(failing.integration.upload(owner, upload(bytes)), fails('DRIVE_REQUEST_FAILED'));
  assert.equal(failing.remote.ranges.length, 1);
  const retried = await createDriveIntegration(failing.options).upload(owner, upload(bytes));
  assert.equal(retried.verified, true);
  assert.equal(failing.remote.uploadIds[0], failing.remote.uploadIds[1]);
  assert.equal(failing.remote.creates.filter(file => file.mimeType !== folderMime).length, 1);
});

test('same-size source mutation is rejected and observer exceptions cannot corrupt completion', async t => {
  const f = await fixture(t); const bytes = new Uint8Array(MAX_MULTIPART_BYTES + 1); bytes.fill(7);
  const filename = join(f.directory, 'managed.mp4'); await writeFile(filename, bytes);
  f.remote.control.onUploadStart = () => { bytes.fill(9); };
  await assert.rejects(f.integration.upload(owner, upload(bytes)), fails('DRIVE_INVALID_INPUT'));
  const clean = await fixture(t);
  const result = await clean.integration.upload(owner, { ...upload(), onProgress: () => { throw new Error('private observer error'); } });
  assert.equal(result.verified, true);
  const retried = await clean.integration.upload(owner, { ...upload(), onProgress: async () => { throw new Error('private async observer error'); } });
  assert.equal(retried.verified, true);
});

test('project API rejects arbitrary parents, missing retry keys, unsafe names, and inaccessible local sources before uploading', async t => {
  const f = await fixture(t);
  for (const request of [{ ...upload(), parentId: 'unrelated_parent' }, { ...upload(), idempotencyKey: undefined },
    { ...upload(), project: { ...project, id: '../invalid' } }, { ...upload(), project: { ...project, name: '../invalid' } },
    { ...upload(), project: { ...project, name: 'invalid\nname' } }]) {
    await assert.rejects(f.integration.upload(owner, request), fails('DRIVE_INVALID_INPUT'));
  }
  await assert.rejects(f.integration.upload(owner, { ...upload(), bytes: undefined, filePath: join(f.directory, '..', 'outside.mp4') }), fails('DRIVE_INVALID_INPUT'));
  assert.equal(f.remote.creates.length, 0);
  for (const [name, mimeType] of [['asset.png', 'image/png'], ['voice.wav', 'audio/wav']]) {
    const result = await f.integration.upload(owner, { ...upload(), name, mimeType, idempotencyKey: name });
    assert.equal(result.verified, true); assert.equal(result.mimeType, mimeType);
  }
});

test('receipt tampering fails closed and concurrent duplicate owner requests share one remote file', async t => {
  const f = await fixture(t);
  const [first, second] = await Promise.all([f.integration.upload(owner, upload()), f.integration.upload(owner, upload())]);
  assert.deepEqual(first, second); assert.equal(f.remote.uploadIds.length, 1);
  const directory = join(f.options.privateDir, 'receipts');
  const filename = join(directory, (await readdir(directory))[0]);
  await writeFile(filename, 'corrupt private receipt');
  await assert.rejects(createDriveIntegration(f.options).upload(owner, upload()), fails('DRIVE_VAULT_FAILED'));
  assert.equal(f.remote.uploadIds.length, 1);
});
