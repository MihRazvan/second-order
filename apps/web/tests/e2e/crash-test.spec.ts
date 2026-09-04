import { expect, test, type Page } from '@playwright/test';

/**
 * The fifteen-second demo in the BIOS utility, end to end. Runs against the dev server
 * (and the stream service when it is up; otherwise the browser replay fallback carries
 * the same story).
 */

async function armed(page: Page) {
  await page.goto('/');
  await expect(page.getByText('STANDBY — PRESS F5')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('header').getByText('DEMO SCENARIO')).toBeVisible();
  await expect(page.locator('[data-readout="r-source"]')).toContainText('+186%');
}

test('F5 tells the source-profit to follower-loss story in about fifteen seconds', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  await armed(page);
  await expect(page).toHaveScreenshot('armed.png', { fullPage: false });

  const t0 = Date.now();
  await page.keyboard.press('F5');
  await expect(page.locator('[data-readout="r-verdict"]')).toContainText('EVALUATING', { timeout: 5_000 });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeGreaterThan(10_000);
  expect(elapsed).toBeLessThan(22_000);

  await expect(dialog.locator('[data-decision]')).toHaveAttribute('data-decision', 'RESIZE');
  await expect(dialog).toContainText(/crowd capture risk/i);
  await expect(dialog).toContainText('−12.4%');
  await expect(dialog).toContainText('$84');
  await expect(dialog.getByRole('button', { name: 'Resize to $84' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Block wallet' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Copy anyway/ })).toBeDisabled();

  // Never claims live capture for a fixture.
  await expect(page.locator('header').getByText('LIVE WITNESSED')).toHaveCount(0);
  await expect(page).toHaveScreenshot('verdict.png', { fullPage: false });
  expect(problems, problems.join('\n')).toEqual([]);
});

test('resize lands on ALLOW and block is local and reversible', async ({ page }) => {
  await armed(page);
  await page.keyboard.press('F5');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'Resize to $84' }).click();
  await expect(page.locator('[data-readout="r-verdict"]')).toContainText('ALLOW');
  await expect(page.locator('#item-size')).toContainText('$84');

  await page.keyboard.press('F8');
  await expect(page.locator('[data-readout="r-verdict"]')).toContainText('WALLET BLOCKED');
  await page.reload();
  await expect(page.locator('[data-readout="r-verdict"]')).toContainText('WALLET BLOCKED', { timeout: 20_000 });
  await page.keyboard.press('F8');
  await expect(page.locator('[data-readout="r-verdict"]')).toContainText('STANDBY');
});

test('F9 opens the evidence log with provenance and assumptions', async ({ page }) => {
  await armed(page);
  await page.keyboard.press('F9');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Evidence Log');
  await expect(dialog).toContainText('Demo scenario');
  await expect(dialog).toContainText('synthetic');
  await expect(dialog).toContainText('Assumptions');
  await expect(dialog).toContainText('not real wallets');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('arrow keys select items and +/- change the intended size in the browser', async ({ page }) => {
  await armed(page);
  await expect(page.locator('#item-size')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('+');
  await expect(page.locator('#item-size')).toContainText('$1,100');
  await page.keyboard.press('-');
  await expect(page.locator('#item-size')).toContainText('$1,000');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#item-delay')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('F2');
  await expect(page.locator('#item-target')).toHaveAttribute('aria-selected', 'true');
});

test('has no horizontal overflow', async ({ page }) => {
  await armed(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
