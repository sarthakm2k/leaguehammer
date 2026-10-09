import { test, expect } from 'playwright/test';

test('copies every registration with only name, position and phone, and offers a clipboard fallback', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('auth_token', 'test-token');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => {
      sessionStorage.setItem('copied-player-details', text);
    } } });
  });
  let entries = [
    { id: 'one', name: 'Arjun Menon', position: 'Forward', phone: '+91 9876543210', email: 'private@test.com', status: 'PENDING', submittedAtUtc: '2026-10-09T00:00:00Z' },
    { id: 'two', name: 'Niyaz', position: 'Midfielder', phone: '0123456789', email: 'hidden@test.com', status: 'APPROVED', submittedAtUtc: '2026-10-09T00:00:00Z' },
    { id: 'three', name: 'Rahul', position: 'Defender', phone: '9999999999', status: 'REJECTED', submittedAtUtc: '2026-10-09T00:00:00Z' },
  ];
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner' } });
    if (path.endsWith('/registrations/settings')) return route.fulfill({ json: { tournamentId: 'copy-cup', slug: 'copy-cup', timeZone: 'Asia/Kolkata', status: 'OPEN', enabled: true } });
    if (path.endsWith('/registrations')) return route.fulfill({ json: entries });
    if (path.endsWith('/copy-cup')) return route.fulfill({ json: { id: 'copy-cup', name: 'Copy Cup', slug: 'copy-cup', season: '2026', status: 'DRAFT', userRole: 'OWNER', createdAtUtc: '2026-10-09T00:00:00Z' } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/tournaments/copy-cup');
  await page.getByRole('button', { name: 'Player Registrations', exact: true }).click();
  const copy = page.getByRole('button', { name: 'Copy player details', exact: true });
  await expect(copy).toBeEnabled();
  await page.getByRole('searchbox').fill('Arjun');
  await expect(page.locator('.registration-entry')).toHaveCount(1);
  await copy.click();
  const expected = 'Name: Arjun Menon\nPosition: Forward\nPhone: +91 9876543210\n\nName: Niyaz\nPosition: Midfielder\nPhone: 0123456789\n\nName: Rahul\nPosition: Defender\nPhone: 9999999999';
  expect(await page.evaluate(() => sessionStorage.getItem('copied-player-details'))).toBe(expected);
  await expect(page.getByRole('status').filter({ hasText: 'Copied details for 3 registered players.' })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Clipboard denied'); } } }));
  await copy.click();
  await expect(page.getByRole('textbox', { name: 'Player details to copy' })).toHaveValue(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  entries = [];
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(copy).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Player details to copy' })).toHaveCount(0);
});
