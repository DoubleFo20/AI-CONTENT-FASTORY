import { z } from 'zod';
import type { CloudJob } from './integrations.js';

// Internal preparation only. A future broker must authenticate this principal;
// possession of these fields is never an enrollment or claim credential.
export const WorkerPrincipalSchema = z.strictObject({
  ownerId: z.uuid(),
  workerId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_.:-]+$/),
});
export type WorkerPrincipal = z.infer<typeof WorkerPrincipalSchema>;

export const WorkerPresenceSchema = WorkerPrincipalSchema.extend({
  connectionEpoch: z.uuid(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastSeenAt: z.iso.datetime(),
  revoked: z.boolean(),
});
export type WorkerPresence = z.infer<typeof WorkerPresenceSchema>;

export const WorkerHeartbeatSchema = z.strictObject({
  connectionEpoch: z.uuid(),
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
export type WorkerHeartbeat = z.infer<typeof WorkerHeartbeatSchema>;

// Derived display state only; never written into the existing job status enum.
export type WorkerJobDisplayStatus = CloudJob['status'] | 'WAITING_FOR_WORKER';
export const DEFAULT_WORKER_PRESENCE_TTL_MS = 90_000;
