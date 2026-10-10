/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI invokes this function expression with its authenticated page. */
async (page) => {
  // Run only on a completed synthetic release-qa-server fixture, in Thai UI.
  const url = new URL(page.url());
  const projectId = url.hash.match(/^#story\/([0-9a-f-]+)\/preview$/)?.[1];
  if (url.hostname !== '127.0.0.1' || !['3004', '3005'].includes(url.port) || !projectId) throw new Error('Open a synthetic QA project preview on loopback port 3004 or 3005 first.');
  await page.reload();
  await page.getByRole('button', { name: 'ดาวน์โหลด MP4', exact: true }).waitFor();
  const before = await page.evaluate(async id => {
    const { project } = await (await fetch(`/api/projects/${id}`)).json();
    const { jobs } = await (await fetch('/api/jobs')).json();
    if (!/QA/i.test(project.name) || project.generation?.ideas !== 'mock' || project.generation?.expansion !== 'mock' || !project.export || jobs.some(job => ['queued', 'running'].includes(job.status))) throw new Error('Use a completed synthetic Mock QA fixture with no active jobs.');
    return { selected: project.selectedIdeaId, exportId: project.export.id, jobs: jobs.length };
  }, projectId);
  const networkAlert = () => page.getByRole('alert').filter({ hasText: 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง' }).first();
  if (await networkAlert().count()) throw new Error('Unexpected network failure before the synthetic transport test');
  const dashboardRoute = '**/api/dashboard';
  await page.route(dashboardRoute, route => route.abort('connectionfailed'));
  try { await networkAlert().waitFor({ state: 'visible', timeout: 20_000 }); }
  finally { await page.unroute(dashboardRoute); }
  await networkAlert().waitFor({ state: 'detached', timeout: 20_000 });
  const artifactRoute = `**/api/exports/${before.exportId}/file`;
  await page.route(artifactRoute, route => route.request().resourceType() === 'fetch' ? route.abort('connectionfailed') : route.continue());
  try {
    await page.getByRole('button', { name: 'ดาวน์โหลด MP4', exact: true }).click();
    await networkAlert().waitFor({ state: 'visible' });
  } finally { await page.unroute(artifactRoute); }
  await page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard' && response.status() === 200, { timeout: 20_000 });
  if (!await networkAlert().isVisible()) throw new Error('Healthy polling dismissed the failed owner command');
  await networkAlert().getByRole('button', { name: 'ปิดข้อความ', exact: true }).click();
  const after = await page.evaluate(async id => {
    const { project } = await (await fetch(`/api/projects/${id}`)).json();
    const { jobs } = await (await fetch('/api/jobs')).json();
    return { selected: project.selectedIdeaId, exportId: project.export.id, jobs: jobs.length };
  }, projectId);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Read-only recovery test unexpectedly changed the project or job history');
  return { pollingFailureVisible: true, healthyPollingClearsReadError: true, failedOwnerDownloadVisibleAfterHealthyPoll: true, explicitDismissalWorks: true, projectAndJobHistoryUnchanged: true, transportInterception: 'Synthetic browser-only failures; no server stop, paid request, import, or export job' };
}
