/** Drive the BIOS utility with the keyboard: F5 runs, capture mid and verdict. Usage: node scripts/bios-run.mjs <outDir> [WxH ...] */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [outDir, ...vps] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const viewports = (vps.length ? vps : ['1440x900']).map((v) => v.split('x').map(Number));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of viewports) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByText('STANDBY', { exact: false }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  const tag = `${w}x${h}`;
  await page.screenshot({ path: join(outDir, `bios-armed-${tag}.png`) });
  const t0 = Date.now();
  await page.keyboard.press('F5');
  await page.waitForTimeout(Number(process.env.MID_MS ?? 6500));
  await page.screenshot({ path: join(outDir, `bios-mid-${tag}.png`) });
  await page.locator('[data-decision]').waitFor({ timeout: 40000 });
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, `bios-verdict-${tag}.png`) });
  const dialog = (await page.locator('[role=dialog]').innerText()).replace(/\n+/g, ' | ').slice(0, 300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(outDir, `bios-end-${tag}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(JSON.stringify({ viewport: tag, elapsedMs: elapsed, dialog, horizontalOverflow: overflow, problems }));
  await page.close();
}
await browser.close();
