import { test, expect, type Page } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';
async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

test('LeagueHammer sign-in stays accessible and fits phone, tablet and desktop', async ({ page }, info) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/LeagueHammer/);
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  await page.getByRole('button', { name: 'Fill Demo Organizer Credentials' }).click();
  await expect(page.getByLabel('Email Address')).toHaveValue('admin@malabarfc.com');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`login-${width}.png`), fullPage: true });
  }
  await page.getByRole('link', { name: 'Create Account' }).click();
  await expect(page.getByLabel('Full Name')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await fits(page);
  await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeVisible();
});

test('broadcast, console, results, franchise and history fit mobile with live data', async ({ browser, request }, info) => {
  const registration = await request.post(`${API}/api/auth/register`, { data: { email: `league-ui-${Date.now()}@example.test`, password: 'LeagueHammer2026!', fullName: 'LeagueHammer UI' } });
  expect(registration.ok()).toBeTruthy();
  const { token } = await registration.json();
  const api = async (method: 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { data, headers: { Authorization: `Bearer ${token}` } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `LeagueHammer Champions Trophy ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  await api('put', `${root}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000, minimumSquadSize: 1, maximumSquadSize: 4, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true });
  const first = await api('post', `${root}/teams`, { name: 'Malabar Falcons Football Club', shortName: 'FFC', initialPurse: 10000 });
  const second = await api('post', `${root}/teams`, { name: 'Coastal Warriors Football Club', shortName: 'WFC', initialPurse: 10000 });
  const set = await api('post', `${root}/player-sets`, { name: 'Marquee Players', sortOrder: 1 });
  for (const name of ['Arjun Krishnan', 'Sameer Menon']) await api('post', `${root}/players`, { name, playerSetId: set.id, basePrice: 500, position: 'Forward', jerseyNumber: 10 });
  await api('post', `${root}/preflight/approve-ready`);
  await api('post', `${root}/auction/start`);
  await api('post', `${root}/auction/start-set`, { setId: set.id });
  const lot = (await api('post', `${root}/auction/reveal-next`)).currentLot;
  const owner = await browser.newContext();
  await owner.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const guest = await browser.newContext();
  const panel = await owner.newPage();
  const stage = await guest.newPage();
  const portal = await guest.newPage();
  const errors: string[] = [];
  for (const page of [panel, stage, portal]) page.on('pageerror', error => errors.push(error.message));
  try {
    await Promise.all([panel.goto(`${root}/auction`), stage.goto(`/live/${tournament.slug}/projector`)]);
    await expect(stage.getByTestId('stage-player')).toHaveText(lot.playerName);
    for (const width of [320, 390, 768, 1440]) {
      await Promise.all([panel.setViewportSize({ width, height: 900 }), stage.setViewportSize({ width, height: 900 })]);
      await fits(panel); await fits(stage);
      await expect(panel.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
      await expect(stage.getByTestId('stage-bid')).toBeVisible();
      await stage.screenshot({ path: info.outputPath(`broadcast-${width}.png`), fullPage: true });
      await panel.screenshot({ path: info.outputPath(`console-${width}.png`), fullPage: true });
    }
    await panel.setViewportSize({ width: 390, height: 844 });
    await panel.getByRole('button', { name: /Malabar Falcons Football Club FFC/ }).click();
    await panel.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1500');
    await panel.getByRole('button', { name: 'Update Live Bid', exact: true }).click();
    await expect(stage.getByTestId('stage-bid')).toHaveText('₹1,500');
    await panel.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(stage.getByTestId('stage-result')).toContainText('SOLD');
    const next = (await api('post', `${root}/auction/reveal-next`)).currentLot;
    await api('post', `${root}/auction/sell`, { lotId: next.lotId, winningTeamId: second.id, finalPrice: 1000 });
    await api('post', `${root}/auction/sets/${set.id}/complete`);
    await api('post', `${root}/auction/complete`, {});
    for (const width of [320, 390, 768, 1440]) {
      await portal.setViewportSize({ width, height: 900 });
      for (const view of ['overview', 'players', 'teams', 'results']) {
        await portal.goto(`/live/${tournament.slug}?view=${view}`);
        await expect(portal.getByRole('heading', { name: tournament.name })).toBeVisible();
        await fits(portal);
        await portal.screenshot({ path: info.outputPath(`${view}-${width}.png`), fullPage: true });
      }
      await portal.goto(`/live/${tournament.slug}/teams/${first.id}`);
      await expect(portal.locator('tbody tr')).toHaveCount(1);
      await fits(portal);
    }
    await panel.goto(`${root}/auction/history`);
    await expect(panel.getByRole('heading', { name: 'Auction history' })).toBeVisible();
    await expect(panel.locator('tbody tr')).toHaveCount(2);
    await fits(panel);
    await panel.screenshot({ path: info.outputPath('history-mobile.png'), fullPage: true });
    await panel.goto('/dashboard');
    await expect(panel.getByRole('heading', { name: 'Your Tournaments' })).toBeVisible(); await fits(panel);
    await panel.screenshot({ path: info.outputPath('dashboard-mobile.png'), fullPage: true });
    await panel.goto(root);
    await expect(panel.getByRole('heading', { name: tournament.name, level: 1 })).toBeVisible(); await fits(panel);
    expect(errors).toEqual([]);
  } finally { await Promise.all([owner.close(), guest.close()]); }
});
