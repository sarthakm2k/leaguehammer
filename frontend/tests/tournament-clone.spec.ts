import { test, expect, type Page } from 'playwright/test';

async function setup(page: Page, role = 'OWNER') {
  let attempts = 0;
  let rejected = false;
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner' } });
    if (path.endsWith('/clone')) {
      attempts++;
      expect(request.method()).toBe('POST');
      expect(request.headers().authorization).toBe('Bearer test-token');
      expect(request.postDataJSON()).toEqual({ name: 'Practice Round' });
      return rejected ? route.fulfill({ status: 403, json: { detail: 'Only the tournament OWNER can clone a tournament.' } }) : route.fulfill({ status: 201, json: { id: 'new-cup' } });
    }
    if (path.endsWith('/teams')) return route.fulfill({ json: [] });
    if (path.endsWith('/settings')) return route.fulfill({ json: { publicLiveViewEnabled: true } });
    const fresh = path.endsWith('/new-cup');
    return route.fulfill({ json: { id: fresh ? 'new-cup' : 'source-cup', name: fresh ? 'Practice Round' : 'PJL Season 4', slug: fresh ? 'practice-round-new' : 'pjl-season-4', season: '2026', status: fresh ? 'DRAFT' : 'COMPLETED', userRole: role, timeZone: 'Asia/Kolkata', createdAtUtc: '2026-10-09T00:00:00Z' } });
  });
  await page.goto('/tournaments/source-cup');
  await expect(page.getByRole('heading', { name: 'Manage Tournament' })).toBeVisible();
  return { attempts: () => attempts, reject: () => { rejected = true; } };
}

test('owner can name a clone, cancel, and open its independent draft overview', async ({ page }) => {
  const requests = await setup(page);
  const button = page.getByRole('button', { name: 'Clone tournament', exact: true });
  await button.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: 'New tournament name' })).toHaveValue('PJL Season 4 — Mock Auction');
  await dialog.getByRole('textbox').fill(' ');
  await expect(dialog.getByRole('button', { name: 'Create clone' })).toBeDisabled();
  await page.keyboard.press('Escape');
  expect(requests.attempts()).toBe(0);
  await button.click();
  await dialog.getByRole('textbox').fill('Practice Round');
  await dialog.getByRole('button', { name: 'Create clone' }).click();
  await expect(page).toHaveURL(/\/tournaments\/new-cup$/);
  await expect(page.getByRole('heading', { name: 'Practice Round', exact: true }).first()).toBeVisible();
  expect(requests.attempts()).toBe(1);
});

test('mobile light-mode clone dialog shows failures and lets the owner retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await setup(page);
  requests.reject();
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.getByRole('button', { name: 'Clone tournament', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Practice Round');
  await dialog.getByRole('button', { name: 'Create clone' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Only the tournament OWNER');
  await expect(dialog.getByRole('button', { name: 'Create clone' })).toBeEnabled();
  await expect(page).toHaveURL(/\/tournaments\/source-cup$/);
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '../testscreenshots/tournament-clone-mobile-light.png' });
});

test('auctioneers cannot see the owner clone action', async ({ page }) => {
  await setup(page, 'AUCTIONEER');
  await expect(page.getByRole('button', { name: 'Clone tournament', exact: true })).toHaveCount(0);
});
