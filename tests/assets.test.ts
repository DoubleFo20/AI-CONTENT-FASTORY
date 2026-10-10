import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import type { Project } from '../shared/contracts.js';
import { EditorSettingsSchema, FlowSettingsSchema } from '../shared/production.js';
import { probeImage } from '../server/images.js';
import { AppError } from '../server/errors.js';
import { ProjectFiles, type StoredImage } from '../server/project-files.js';

const execFileAsync = promisify(execFile);
const ownerId = randomUUID();

async function directory(t: TestContext, prefix: string): Promise<string> {
  const root = resolve('.tmp');
  await mkdir(root, { recursive: true });
  const path = await mkdtemp(join(root, prefix));
  t.after(async () => rm(path, { recursive: true, force: true }));
  return path;
}

function errorCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

async function image(path: string, size: string): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=blue:s=${size}`,
    '-frames:v', '1', '-threads', '1', path,
  ], { windowsHide: true });
}

test('probeImage reads dimensions from real PNG, JPEG, and WebP fixtures', async t => {
  const dir = await directory(t, 'assets-probe-');
  for (const extension of ['png', 'jpg', 'webp'] as const) {
    const path = join(dir, `valid.${extension}`);
    await image(path, '32x24');
    assert.deepEqual(await probeImage(path), { width: 32, height: 24 }, `${extension} dimensions`);
  }
});

test('probeImage rejects malformed, empty, unsupported-extension, missing, oversized, and oversized-dimension images', async t => {
  const dir = await directory(t, 'assets-invalid-');
  const malformed = join(dir, 'malformed.png');
  await writeFile(malformed, 'not an image');
  await assert.rejects(probeImage(malformed), errorCode('INVALID_MEDIA'));

  const empty = join(dir, 'empty.png');
  await writeFile(empty, Buffer.alloc(0));
  await assert.rejects(probeImage(empty), errorCode('INVALID_MEDIA'));

  const unsupported = join(dir, 'image.gif');
  await image(join(dir, 'valid.png'), '32x24');
  await writeFile(unsupported, await readFile(join(dir, 'valid.png')));
  await assert.rejects(probeImage(unsupported), errorCode('INVALID_MEDIA'));

  await assert.rejects(probeImage(join(dir, 'missing.webp')), errorCode('INVALID_MEDIA'));

  const oversized = join(dir, 'oversized.jpg');
  await writeFile(oversized, Buffer.alloc(1));
  await truncate(oversized, 16 * 1024 * 1024 + 1);
  await assert.rejects(probeImage(oversized), errorCode('INVALID_MEDIA'));

  const hugeDimensions = join(dir, 'wide.png');
  await image(hugeDimensions, '8193x1');
  await assert.rejects(probeImage(hugeDimensions), errorCode('INVALID_MEDIA'));
});

test('ProjectFiles persists image metadata without exposing managed filenames and isolates owners and projects', async t => {
  const dir = await directory(t, 'assets-state-');
  const files = new ProjectFiles(dir);
  const projectId = randomUUID();
  const project = { id: projectId, package: null } as unknown as Project;
  const imageId = randomUUID();
  const stored: StoredImage = {
    id: imageId, projectId, originalName: 'reference.webp', width: 32, height: 24,
    createdAt: new Date().toISOString(), filename: `${imageId}.webp`,
  };

  const created = files.addImage(project, ownerId, stored);
  assert.deepEqual(created, {
    id: stored.id, projectId, originalName: stored.originalName, width: 32, height: 24, createdAt: stored.createdAt,
  });
  assert.equal(JSON.stringify(files.state(project, ownerId)).includes(stored.filename), false);
  assert.equal(files.image(project, ownerId, imageId).filename, stored.filename);
  assert.deepEqual(new ProjectFiles(dir).state(project, ownerId).images, [created]);

  assert.throws(() => files.state(project, randomUUID()), errorCode('NOT_FOUND'));
  const otherProject = { id: randomUUID(), package: null } as unknown as Project;
  assert.deepEqual(files.state(otherProject, ownerId).images, []);
  assert.throws(() => files.image(otherProject, ownerId, imageId), errorCode('NOT_FOUND'));
});

test('ProjectFiles reads legacy version 1 sidecars without an images property', async t => {
  const dir = await directory(t, 'assets-legacy-');
  const projectId = randomUUID();
  const project = { id: projectId, package: null } as unknown as Project;
  const settingsDir = join(dir, 'settings', 'projects');
  await mkdir(settingsDir, { recursive: true });
  await writeFile(join(settingsDir, `${projectId}.json`), JSON.stringify({
    version: 1,
    ownerId,
    projectId,
    flow: FlowSettingsSchema.parse({}),
    editor: EditorSettingsSchema.parse({}),
    scenes: {},
    audio: [],
  }));

  assert.deepEqual(new ProjectFiles(dir).state(project, ownerId).images, []);
});
