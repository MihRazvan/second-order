/**
 * Browser inspection: open routes at the required viewports, capture screenshots and
 * console/network failures. Usage: node scripts/inspect.mjs <outDir> <route> [route...]
 * Env: BASE_URL (default http://localhost:3000), VIEWPORTS="1440x900,1280x800,390x844", FULL=1
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, ...routes] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
const viewports = (process.env.VIEWPORTS ?? '1440x900').split(',').map((v) => v.split('x').map(Number));
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
for (const route of routes) {
  for (const [w, h] of viewports) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference' });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 300)}`));
    page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    await page.goto(base + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 800));
    const overflow = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, scrollH: document.documentElement.scrollHeight }));
    const name = `${route.replace(/\//g, '_').replace(/^_/, '') || 'home'}-${w}x${h}.png`;
    await page.screenshot({ path: join(outDir, name), fullPage: !!process.env.FULL });
    console.log(JSON.stringify({ route, viewport: `${w}x${h}`, file: name, horizontalOverflow: overflow.scrollW > overflow.innerW, scrollW: overflow.scrollW, pageHeight: overflow.scrollH, problems }));
    await ctx.close();
  }
}
await browser.close();
