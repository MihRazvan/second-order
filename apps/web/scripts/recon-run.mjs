/** Drive a reconstruction for a real wallet through the UI and capture the verdict + report. Usage: node scripts/recon-run.mjs <outDir> <wallet> [chainId] */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, wallet, chainId = 'evm:8453'] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.getByLabel('Wallet address').fill(wallet);
await page.locator('select').first().selectOption(chainId);
await page.getByRole('button', { name: 'Reconstruct crash test' }).click();
await page.getByText('EVALUATING').waitFor({ timeout: 60_000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: join(outDir, 'recon-mid.png') });
await page.locator('[data-decision]').waitFor({ timeout: 120_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, 'recon-end.png') });
const panel = await page.locator('[data-decision]').innerText();
const status = await page.locator('header').innerText();
const share = page.getByRole('link', { name: 'Share report' });
let report = null;
if (await share.count()) {
  const href = await share.getAttribute('href');
  await page.goto(base + href, { waitUntil: 'networkidle' });
  await page.locator('[data-decision]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(outDir, 'report.png'), fullPage: true });
  report = href;
}
console.log(JSON.stringify({ wallet, panel: panel.replace(/\n+/g, ' | ').slice(0, 220), status: status.replace(/\n+/g, ' | ').slice(0, 160), report, problems }));
await browser.close();
