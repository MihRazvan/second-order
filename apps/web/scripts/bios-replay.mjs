/** Cycle the REPLAY item to a title fragment, run it with F5, capture the verdict. Usage: node scripts/bios-replay.mjs <outDir> <fragment> */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
const [outDir, fragment] = process.argv.slice(2);
const base = process.env.BASE_URL ?? 'http://localhost:3000';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const problems = [];
page.on('pageerror', (e) => problems.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text().slice(0, 200)); });
await page.goto(base + '/', { waitUntil: 'networkidle' });
await page.getByText('STANDBY', { exact: false }).waitFor();
await page.locator('#item-replay').click();
for (let i = 0; i < 6; i++) {
  const v = await page.locator('#item-replay').innerText();
  if (new RegExp(fragment, 'i').test(v)) break;
  await page.keyboard.press('+');
  await page.waitForTimeout(900);
}
await page.getByText('STANDBY', { exact: false }).waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, `replay-${fragment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-armed.png`) });
await page.keyboard.press('F5');
await page.locator('[role=dialog]').waitFor({ timeout: 120000 });
await page.waitForTimeout(700);
await page.screenshot({ path: join(outDir, `replay-${fragment.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-verdict.png`) });
console.log(JSON.stringify({ fragment, replay: await page.locator('#item-replay').innerText(), dialog: (await page.locator('[role=dialog]').innerText()).replace(/\n+/g, ' | ').slice(0, 220), problems }));
await browser.close();
