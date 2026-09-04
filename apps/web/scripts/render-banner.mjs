import { chromium } from '@playwright/test';
const [src, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 520 }, deviceScaleFactor: 1 });
await page.goto('file://' + src, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920, height: 520 } });
await browser.close();
console.log('wrote', out);
