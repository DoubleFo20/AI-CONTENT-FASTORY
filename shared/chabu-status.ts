import type { JobStatus, ProductionStatus } from './contracts.js';
import type { ChabuEpisode } from './chabu.js';

export type ChabuExecutionStatus = ChabuEpisode['manualStage'] | 'queued' | 'processing' | 'completed' | 'failed';

// Waiting for a person is not an executable worker task. Project/job records stay authoritative.
export function chabuExecutionStatus(episode: {
  manualStage: ChabuEpisode['manualStage']; project: { status: ProductionStatus }; jobs: readonly { status: JobStatus }[];
}): ChabuExecutionStatus {
  if (episode.manualStage === 'cancelled') return 'cancelled';
  const active = episode.jobs.find(job => job.status === 'queued' || job.status === 'running');
  if (active) return active.status === 'running' ? 'processing' : 'queued';
  if (episode.project.status === 'exported') return 'completed';
  if (episode.jobs[0]?.status === 'failed') return 'failed';
  return episode.manualStage;
}
