/* eslint-disable @typescript-eslint/no-unused-expressions -- Playwright CLI invokes this function with its authenticated page. */
async (page) => {
  const url = new URL(page.url());
  if (url.hostname !== '127.0.0.1' || !['3012', '3014'].includes(url.port)) throw new Error('Open the authenticated synthetic release QA app on 127.0.0.1:3012 or 3014 first.');
  const fixture = await page.evaluate(async () => {
    const [projectsResponse, capabilitiesResponse] = await Promise.all([
      fetch('/api/projects'),
      fetch('/api/integrations/capabilities'),
    ]);
    if (!projectsResponse.ok || !capabilitiesResponse.ok) throw new Error('The synthetic fixture is not authenticated.');
    const { projects } = await projectsResponse.json();
    const { capabilities } = await capabilitiesResponse.json();
    return {
      syntheticProject: projects.some(project => project.generation?.ideas === 'mock' && project.generation?.expansion === 'mock'),
      mockMode: capabilities.ai?.mode === 'mock' && capabilities.ai?.active === 'mock',
    };
  });
  if (!fixture.syntheticProject || !fixture.mockMode) throw new Error('The authenticated fixture must contain a completed Mock story in Mock mode.');

  const cases = [];
  const locales = ['th', 'en'];
  const widths = [360, 768, 1440];
  const contrastRatio = (foreground, background) => {
    const linear = value => {
      const channel = Number(value) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    };
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(linear);
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };
  for (const locale of locales) {
    await page.locator('header .locale select').selectOption(locale);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${url.origin}/#dashboard`);
      await page.waitForTimeout(100);

      for (const type of ['settings', 'picker']) {
        const labels = locale === 'th'
          ? { settings: 'การตั้งค่า / การเชื่อมต่อ', picker: 'ตัวประกอบวิดีโอ', close: 'ปิด', menu: 'เมนู' }
          : { settings: 'Settings / integrations', picker: 'Auto Editor', close: 'Close', menu: 'Menu' };
        let opener;
        if (type === 'settings') {
          opener = page.getByRole('button', { name: labels.settings, exact: true });
          await opener.click();
        } else {
          const sidebarPicker = page.locator('nav.sidebar').getByRole('button', { name: labels.picker, exact: true });
          if (await sidebarPicker.isVisible().catch(() => false)) {
            opener = sidebarPicker;
            await opener.click();
          } else {
            opener = page.locator('button.menu-toggle');
            await opener.click();
            await page.locator('#navigation-drawer').getByRole('button', { name: labels.picker, exact: true }).click();
          }
        }

        const dialog = page.getByRole('dialog').filter({ has: page.locator('h2') });
        await dialog.waitFor({ state: 'visible' });
        const heading = await dialog.locator('h2').innerText();
        const expectedHeading = type === 'settings'
          ? (locale === 'th' ? 'การตั้งค่า / การเชื่อมต่อ' : 'Settings / integrations')
          : (locale === 'th' ? 'เลือกโครงการ' : 'Project picker');
        const closeButton = dialog.getByRole('button', { name: labels.close, exact: true });
        await closeButton.waitFor({ state: 'visible' });
        const metrics = await dialog.evaluate(element => {
          const style = element.ownerDocument.defaultView.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return {
            visible: element.open,
            background: style.backgroundColor,
            foreground: style.color,
            closeForeground: element.ownerDocument.defaultView.getComputedStyle(element.querySelector('button')).color,
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            overflowX: element.scrollWidth > element.clientWidth,
            overflowY: element.scrollHeight > element.clientHeight + 2,
          };
        });
        metrics.textContrast = contrastRatio(metrics.foreground, metrics.background);
        metrics.closeContrast = contrastRatio(metrics.closeForeground, metrics.background);
        const controls = type === 'settings'
          ? { provider: await dialog.locator('select').count(), refresh: await dialog.getByRole('button', { name: locale === 'th' ? 'โหลดใหม่' : 'Refresh', exact: true }).isVisible() }
          : {
            createStory: await dialog.getByRole('link', { name: locale === 'th' ? 'สร้างเรื่องใหม่' : 'Create a story', exact: true }).isVisible().catch(() => false),
            projectLinks: await dialog.locator('a.picker-project').count(),
          };
        const controlsOk = type === 'settings'
          ? controls.provider === 1 && controls.refresh
          : controls.createStory || controls.projectLinks > 0;

        await page.keyboard.press('Shift+Tab');
        const lastFocus = await dialog.evaluate(element => ({
          tag: element.ownerDocument.activeElement?.tagName || '',
          inDialog: Boolean(element.ownerDocument.activeElement?.closest('dialog')),
        }));
        await page.keyboard.press('Tab');
        const firstFocus = await dialog.evaluate(element => (element.ownerDocument.activeElement?.textContent || '').trim());
        const tabWrapped = firstFocus === labels.close;

        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        const escapeRestoredFocus = await opener.evaluate(element => document.activeElement === element).catch(() => false);

        // Reopen via the same real UI trigger and verify close-button focus restoration too.
        if (type === 'settings') {
          opener = page.getByRole('button', { name: labels.settings, exact: true });
          await opener.click();
        } else if (await page.locator('nav.sidebar').getByRole('button', { name: labels.picker, exact: true }).isVisible().catch(() => false)) {
          opener = page.locator('nav.sidebar').getByRole('button', { name: labels.picker, exact: true });
          await opener.click();
        } else {
          opener = page.locator('button.menu-toggle');
          await opener.click();
          await page.locator('#navigation-drawer').getByRole('button', { name: labels.picker, exact: true }).click();
        }
        await dialog.waitFor({ state: 'visible' });
        await dialog.getByRole('button', { name: labels.close, exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        const closeRestoredFocus = await opener.evaluate(element => document.activeElement === element).catch(() => false);
        const viewportVisible = metrics.visible && metrics.box.x >= 0 && metrics.box.y >= 0 && metrics.box.x + metrics.box.width <= width && metrics.box.y + metrics.box.height <= 800;
        const caseResult = { type, locale, width, heading, expectedHeading, headingOk: heading === expectedHeading, controls, controlsOk, metrics, lastFocus, firstFocus, tabWrapped, escapeRestoredFocus, closeRestoredFocus, viewportVisible };
        cases.push(caseResult);

        if (caseResult.headingOk !== true || !controlsOk || !metrics.visible || metrics.textContrast < 4.5 || metrics.closeContrast < 4.5 || !viewportVisible || metrics.overflowX || metrics.overflowY || !tabWrapped || !escapeRestoredFocus || !closeRestoredFocus) {
          throw new Error(`Modal focus regression failed: ${JSON.stringify(caseResult)}`);
        }
      }
    }
  }
  return { count: cases.length, passed: cases.length, cases };
}
