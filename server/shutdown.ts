import type { Server } from 'node:http';

// Stop admission before draining HTTP. Background cancellation must precede the
// drain so a Drive cache request cannot keep the SQLite owner store open forever.
export async function shutdownApplication(server: Server, application: { stopBackground(): Promise<void>; close(): Promise<void> }, httpDrainMs = 10_000): Promise<void> {
  if (!Number.isInteger(httpDrainMs) || httpDrainMs < 1 || httpDrainMs > 60_000) throw new Error('Invalid shutdown deadline.');
  const drained = new Promise<void>(resolve => { server.close(() => resolve()); });
  server.closeIdleConnections();
  const timer = setTimeout(() => server.closeAllConnections(), httpDrainMs);
  try {
    const results = await Promise.allSettled([application.stopBackground(), drained]);
    if (results[0].status === 'rejected') throw results[0].reason;
  } finally {
    clearTimeout(timer);
    await application.close();
  }
}
