/** Select a bundled replay by title fragment, run it, capture the verdict. Usage: node scripts/replay-run.mjs <outDir> <titleFragment> */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir, fragment] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text().slice(0, 200)}`); });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: new RegExp(fragment, 'i') }).first().click();
await page.getByRole('button', { name: 'Crash test this wallet' }).waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
const armedText = await page.locator('header').innerText();
await page.getByRole('button', { name: 'Crash test this wallet' }).click();
await page.locator('[data-decision]').waitFor({ timeout: 120_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: join(outDir, `replay-${fragment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`) });
console.log(JSON.stringify({ fragment, armed: armedText.replace(/\n+/g, ' | '), panel: (await page.locator('[data-decision]').innerText()).replace(/\n+/g, ' | ').slice(0, 260), problems }));
await browser.close();
