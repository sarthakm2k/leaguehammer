import { test, expect } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';

test('overview auctioneer link uses the configuring account and returns to the console after login', async ({ browser, request }, testInfo) => {
  const email = `auctioneer-access-${Date.now()}@example.test`;
  const password = 'AuctioneerAccess!2026';
  const registration = await request.post(`${API}/api/auth/register`, { data: { email, password, fullName: 'Auctioneer Access Verification' } });
  expect(registration.ok()).toBeTruthy();
  const { token } = await registration.json();
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Auctioneer Access Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  await api('put', `${root}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000,
    minimumSquadSize: 1, maximumSquadSize: 2, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true });
  await api('post', `${root}/teams`, { name: 'Falcons FC', shortName: 'FFC', initialPurse: 10000 });
  await api('post', `${root}/teams`, { name: 'Warriors FC', shortName: 'WFC', initialPurse: 10000 });
  const set = await api('post', `${root}/player-sets`, { name: 'Opening Players', sortOrder: 1 });
  for (const name of ['Opening One', 'Opening Two']) await api('post', `${root}/players`, { name, playerSetId: set.id, basePrice: 500, position: 'Forward' });
  const owner = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await owner.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const overview = await owner.newPage();
  const remote = await browser.newContext();
  const panel = await remote.newPage();
  const errors: string[] = [];
  for (const page of [overview, panel]) page.on('pageerror', error => errors.push(error.message));
  try {
    await overview.goto(root);
    await expect(overview.getByRole('heading', { name: 'Manage Tournament' })).toBeVisible();
    await expect(overview.getByRole('button', { name: 'Copy Auctioneer Link' })).toHaveCount(0);
    expect(await overview.locator('body').innerText()).not.toMatch(/milestone|implementation|engine & ui/i);
    await api('post', `${root}/preflight/approve-ready`);
    await overview.reload();
    const url = new URL(`${root}/auction`, overview.url()).href;
    await expect(overview.getByLabel('Auctioneer panel link')).toHaveValue(url);
    await expect(overview.getByRole('link', { name: 'Open Auctioneer Console', exact: true })).toHaveAttribute('href', `${root}/auction`);
    await overview.getByRole('button', { name: 'Copy Auctioneer Link' }).click();
    await expect(overview.getByText('Auctioneer link copied')).toBeVisible();
    expect(await overview.evaluate(() => navigator.clipboard.readText())).toBe(url);
    expect(url).not.toContain(password);
    expect(url).not.toContain(token);
    await overview.screenshot({ path: testInfo.outputPath('overview-auctioneer-link.png'), fullPage: true });
    await panel.goto(url);
    await expect(panel).toHaveURL(/\/login$/);
    expect(await panel.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    await panel.locator('input[type=email]').fill(email);
    await panel.locator('input[type=password]').fill(password);
    await panel.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(panel).toHaveURL(url);
    await expect(panel.getByRole('status')).toContainText('Live connection');
    await expect(panel.getByRole('button', { name: 'Launch Auction', exact: true })).toBeEnabled();
    expect(await panel.locator('body').innerText()).not.toMatch(/Console V1|Audited Engine V1|milestone/i);
    await panel.getByRole('button', { name: 'Launch Auction', exact: true }).click();
    await expect(panel.getByRole('button', { name: /Opening Players/ })).toBeVisible();
    expect((await api('get', `${root}/auction`)).sessionStatus).toBe('LIVE');
    await overview.reload();
    await expect(overview.getByLabel('Auctioneer panel link')).toHaveValue(url);
    await overview.getByRole('link', { name: 'Open Auctioneer Console', exact: true }).click();
    await expect(overview).toHaveURL(url);
    // The shared URL still requires normal tournament authorization.
    const denied = await request.get(`${API}/api${root}/auction`);
    expect(denied.status()).toBe(401);
    // Direct sign-in retains the ordinary dashboard destination.
    await panel.evaluate(() => localStorage.removeItem('auth_token'));
    await panel.goto('/login');
    await panel.locator('input[type=email]').fill(email);
    await panel.locator('input[type=password]').fill(password);
    await panel.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(panel).toHaveURL(/\/dashboard$/);
    expect(errors).toEqual([]);
  } finally { await Promise.all([owner.close(), remote.close()]); }
});
