import { expect, test, type Page } from '@playwright/test';

/**
 * The fifteen-second demo, end to end. Runs against the dev server (and the stream
 * service when it is up; otherwise the browser replay fallback carries the same story).
 */

async function armed(page: Page) {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Crash test this wallet' });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('+186%')).toBeVisible();
  await expect(page.getByText('Demo scenario', { exact: true })).toBeVisible();
  return start;
}

test('tells the source-profit to follower-loss story in about fifteen seconds', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });

  const start = await armed(page);
  await expect(page).toHaveScreenshot('armed.png', { fullPage: false });

  const t0 = Date.now();
  await start.click();
  await expect(page.getByText('EVALUATING')).toBeVisible({ timeout: 5_000 });

  const panel = page.locator('[data-decision]');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeGreaterThan(10_000);
  expect(elapsed).toBeLessThan(22_000);

  await expect(panel).toHaveAttribute('data-decision', 'RESIZE');
  await expect(panel).toContainText('CROWD CAPTURE RISK');
  await expect(panel).toContainText('−12.4%');
  await expect(panel).toContainText('$84');
  await expect(panel.getByRole('button', { name: 'Resize to $84' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Block wallet' })).toBeVisible();

  // Never claims live capture for a fixture.
  await expect(page.getByText('Live witnessed', { exact: true })).toHaveCount(0);
  await expect(page).toHaveScreenshot('verdict.png', { fullPage: false });
  expect(problems, problems.join('\n')).toEqual([]);
});

test('resize lands on a scenario-compatible verdict and block is local', async ({ page }) => {
  const start = await armed(page);
  await start.click();
  const panel = page.locator('[data-decision]');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.getByRole('button', { name: 'Resize to $84' }).click();
  await expect(panel).toHaveAttribute('data-decision', 'ALLOW');
  await expect(page.getByLabel('Intended size')).toHaveValue('84');

  await panel.getByRole('button', { name: 'Block wallet' }).click();
  await expect(page.getByText('WALLET BLOCKED')).toBeVisible();
  await page.reload();
  await expect(page.getByText('WALLET BLOCKED')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Unblock' }).click();
  await expect(page.getByRole('button', { name: 'Crash test this wallet' })).toBeVisible();
});

test('evidence drawer exposes provenance, inputs and assumptions', async ({ page }) => {
  await armed(page);
  await page.getByRole('button', { name: 'Open evidence' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Demo scenario');
  await expect(dialog).toContainText('synthetic');
  await expect(dialog).toContainText('Assumptions');
  await expect(dialog).toContainText('not real wallets');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('has no horizontal overflow', async ({ page }) => {
  await armed(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
