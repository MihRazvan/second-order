/** Drive the 15-second demo and capture armed / mid / end frames. Usage: node scripts/demo-run.mjs <outDir> [WxH ...] */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, ...vps] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const viewports = (vps.length ? vps : ['1440x900']).map((v) => v.split('x').map(Number));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const [w, h] of viewports) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 240)}`));
  page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Crash test this wallet' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  const tag = `${w}x${h}`;
  await page.screenshot({ path: join(outDir, `demo-armed-${tag}.png`) });
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Crash test this wallet' }).click();
  await page.waitForTimeout(Number(process.env.MID_MS ?? 6500));
  await page.screenshot({ path: join(outDir, `demo-mid-${tag}.png`) });
  await page.locator('[data-decision]').waitFor({ timeout: 30000 });
  const elapsed = Date.now() - t0;
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, `demo-end-${tag}.png`) });
  const decision = await page.locator('[data-decision]').getAttribute('data-decision');
  const texts = await page.locator('[data-decision]').innerText();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log(JSON.stringify({ viewport: tag, elapsedMs: elapsed, decision, panel: texts.replace(/\n+/g, ' | ').slice(0, 200), horizontalOverflow: overflow, problems }));
  await ctx.close();
}
await browser.close();
