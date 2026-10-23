import test from 'node:test';
import assert from 'node:assert/strict';
import { chabuExecutionStatus } from '../shared/chabu-status.js';

test('CHABU status separates durable manual waits from worker execution and current output', () => {
  const episode = { manualStage: 'draft', project: { status: 'expanded' }, jobs: [] } as const;
  assert.equal(chabuExecutionStatus(episode), 'draft');
  assert.equal(chabuExecutionStatus({ ...episode, manualStage: 'awaiting_external_generation' }), 'awaiting_external_generation');
  assert.equal(chabuExecutionStatus({ ...episode, manualStage: 'awaiting_upload' }), 'awaiting_upload');
  assert.equal(chabuExecutionStatus({ ...episode, jobs: [{ status: 'queued' }] }), 'queued');
  assert.equal(chabuExecutionStatus({ ...episode, jobs: [{ status: 'running' }] }), 'processing');
  assert.equal(chabuExecutionStatus({ ...episode, jobs: [{ status: 'failed' }] }), 'failed');
  assert.equal(chabuExecutionStatus({ ...episode, project: { status: 'exported' }, jobs: [{ status: 'failed' }] }), 'completed');
  assert.equal(chabuExecutionStatus({ ...episode, project: { status: 'exported' }, jobs: [{ status: 'queued' }] }), 'queued');
  assert.equal(chabuExecutionStatus({ ...episode, project: { status: 'clips_ready' }, jobs: [{ status: 'completed' }] }), 'draft');
  assert.equal(chabuExecutionStatus({ ...episode, manualStage: 'cancelled', jobs: [{ status: 'queued' }] }), 'cancelled');
});
