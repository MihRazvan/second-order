/** Record a backup demo video: the F5 run, resize, delay change, and the real honeypot replay. Usage: node scripts/record-demo.mjs <outDir> */
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const [outDir] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: outDir, size: { width: 1440, height: 900 } } });
const page = await ctx.newPage();
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.getByText('STANDBY', { exact: false }).waitFor();
await page.waitForTimeout(2500);
await page.keyboard.press('F5');
await page.locator('[role=dialog]').waitFor({ timeout: 40000 });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Resize to $84' }).click();
await page.waitForTimeout(1800);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(600);
await page.keyboard.press('-'); await page.waitForTimeout(700);
await page.keyboard.press('-'); await page.waitForTimeout(1500);
await page.keyboard.press('ArrowUp'); await page.waitForTimeout(300);
// back to the REPLAY item and cycle to the real honeypot
for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120); }
for (let i = 0; i < 6; i++) {
  const v = await page.locator('#item-replay').innerText();
  if (/CBBTC/i.test(v)) break;
  await page.keyboard.press('+');
  await page.waitForTimeout(1200);
}
await page.getByText('STANDBY', { exact: false }).waitFor();
await page.waitForTimeout(1500);
await page.keyboard.press('F5');
await page.locator('[role=dialog]').waitFor({ timeout: 120000 });
await page.waitForTimeout(3500);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await page.keyboard.press('F9');
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);
const video = page.video();
await ctx.close();
const path = await video.path();
renameSync(path, join(outDir, 'demo-backup.webm'));
console.log(JSON.stringify({ webm: join(outDir, 'demo-backup.webm'), files: readdirSync(outDir) }));
await browser.close();
