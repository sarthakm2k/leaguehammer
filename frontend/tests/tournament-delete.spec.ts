import { test, expect, type Page } from 'playwright/test';

async function workspace(page: Page, role = 'OWNER', status = 'COMPLETED') {
  let deletes = 0;
  let reject = false;
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner', email: 'owner@test.com' } });
    if (request.method() === 'DELETE') {
      deletes++;
      expect(request.headers().authorization).toBe('Bearer test-token');
      return reject ? route.fulfill({ status: 400, json: { detail: 'A live or paused auction cannot be deleted. Complete the auction first.' } }) : route.fulfill({ status: 204 });
    }
    if (path.endsWith('/tournaments')) return route.fulfill({ json: [] });
    if (path.endsWith('/teams')) return route.fulfill({ json: [] });
    if (path.endsWith('/settings')) return route.fulfill({ json: { publicLiveViewEnabled: true } });
    return route.fulfill({ json: { id: 'delete-cup', name: 'Delete Cup', slug: 'delete-cup', season: '2026', status, userRole: role, timeZone: 'Asia/Kolkata', createdAtUtc: '2026-10-08T00:00:00Z' } });
  });
  await page.goto('/tournaments/delete-cup');
  await expect(page.getByRole('heading', { name: 'Manage Tournament' })).toBeVisible();
  return { deletes: () => deletes, reject: () => { reject = true; } };
}

test('owner confirms the name, can cancel, and returns to dashboard after deletion', async ({ page }) => {
  const requests = await workspace(page);
  const open = page.getByRole('button', { name: 'Delete tournament', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const remove = dialog.getByRole('button', { name: 'Permanently delete' });
  await expect(remove).toBeDisabled();
  await dialog.getByRole('textbox').fill('Wrong tournament');
  await expect(remove).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(requests.deletes()).toBe(0);
  await open.click();
  await expect(dialog.getByRole('textbox')).toHaveValue('');
  await dialog.getByRole('textbox').fill('Delete Cup');
  await remove.click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(requests.deletes()).toBe(1);
});

test('mobile light mode confirmation keeps backend errors visible without leaving the workspace', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await workspace(page, 'OWNER', 'READY');
  requests.reject();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.getByRole('button', { name: 'Delete tournament', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Delete Cup');
  await dialog.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(dialog.getByRole('alert')).toContainText('live or paused');
  await expect(page).toHaveURL(/\/tournaments\/delete-cup$/);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../testscreenshots/tournament-delete-mobile-light.png' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
});

test('auctioneers do not see deletion and live tournaments disable it for owners', async ({ page }) => {
  await workspace(page, 'AUCTIONEER');
  await expect(page.getByRole('button', { name: 'Delete tournament', exact: true })).toHaveCount(0);
  await page.unroute('**/api/**');
  await workspace(page, 'OWNER', 'LIVE');
  await expect(page.getByRole('button', { name: 'Delete tournament', exact: true })).toBeDisabled();
});
