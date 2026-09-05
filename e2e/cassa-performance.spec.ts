import { expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { intercetta } from './helpers/cash-register-fixtures';
import { test } from './helpers/isolated-test';

const phase = process.env['CASSA_PERF_PHASE'] ?? 'after';
const mobile = process.env['CASSA_PERF_MOBILE'] === '1';
const sizes = (process.env['CASSA_PERF_SIZES'] ?? '100,1000,2000,5000').split(',').map(Number);
const directory = join(
  process.cwd(),
  'test-results',
  'cassa-performance',
  mobile ? `${phase}-mobile` : phase,
);

for (const size of sizes) {
  test(`prestazioni Cassa: ${size} operazioni`, async ({ page }, info) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await intercetta(page, size);
    // Compilazione e caricamento dei moduli fuori dalla misura. Stessa build E2E prima/dopo.
    await page.goto('/app/cassa/operazioni');
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 90_000 });
    if (mobile)
      await expect(page.locator('.data-table__row')).toHaveCount(size, { timeout: 90_000 });
    await page.goto('/app/dashboard');

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.start');
    await page.addInitScript(() => {
      const state = { firstRowsMs: 0, peakRows: 0 };
      Object.assign(window, { cassaPerformance: state });
      const observe = (): void => {
        const rows = document.querySelectorAll('.data-table__row').length;
        state.peakRows = Math.max(state.peakRows, rows);
        if (rows > 0 && state.firstRowsMs === 0) state.firstRowsMs = performance.now();
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    let responseMs = 0;
    const start = Date.now();
    const response = page
      .waitForResponse((r) => r.url().includes('/cash-sessions/operations'))
      .then(() => {
        responseMs = Date.now() - start;
      });
    await page.goto('/app/cassa/operazioni');
    await response;
    await expect(page.locator('.data-table__row').first()).toBeVisible({ timeout: 90_000 });
    if (mobile)
      await expect(page.locator('.data-table__row')).toHaveCount(size, { timeout: 90_000 });
    const loadMs = Date.now() - start;
    const metrics = await cdp.send('Performance.getMetrics');
    const { profile } = await cdp.send('Profiler.stop');
    const dom = await page.evaluate(() => ({
      rows: document.querySelectorAll('.data-table__row').length,
      nodes: document.querySelectorAll('.data-table *').length,
      state: (window as unknown as { cassaPerformance: { firstRowsMs: number; peakRows: number } })
        .cassaPerformance,
    }));
    const scrollStart = Date.now();
    await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>('.data-table-scroll')!;
      scroller.scrollTop = scroller.scrollHeight;
    });
    await expect(page.locator(`.data-table__row[data-row-id="d-${size - 1}"]`)).toBeVisible();
    const scrollMs = Date.now() - scrollStart;
    const result = {
      phase,
      size,
      repeat: info.repeatEachIndex,
      loadMs,
      responseMs,
      afterResponseMs: loadMs - responseMs,
      scrollMs,
      ...dom,
      metrics: metrics.metrics,
    };
    mkdirSync(directory, { recursive: true });
    const name = `${size}-${info.repeatEachIndex}`;
    writeFileSync(join(directory, `${name}.json`), JSON.stringify(result, null, 2));
    writeFileSync(join(directory, `${name}.cpuprofile`), JSON.stringify(profile));
    console.log(JSON.stringify(result));
    if (mobile) {
      expect(dom.rows).toBe(size);
      expect(await page.locator('.data-table__spacer').count()).toBe(0);
    } else {
      expect(dom.rows).toBeLessThan(120);
      if (phase !== 'before') expect(loadMs).toBeLessThan(10_000);
    }
  });
}
