import { test, expect } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';

test('Sell all players setting enables continuous rounds through attempt four', async ({ browser, request }) => {
  const registration = await request.post(`${API}/api/auth/register`, { data: {
    email: `continuous-${Date.now()}@example.test`, password: 'ContinuousTest!2026', fullName: 'Continuous Round Verification',
  } });
  expect(registration.ok()).toBeTruthy();
  const { token } = await registration.json();
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Continuous Rounds Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  const rules = { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000, minimumSquadSize: 1,
    maximumSquadSize: 4, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true };
  await api('put', `${root}/settings`, rules);
  const first = await api('post', `${root}/teams`, { name: 'Falcons FC', shortName: 'FFC', initialPurse: 10000 });
  const second = await api('post', `${root}/teams`, { name: 'Warriors FC', shortName: 'WFC', initialPurse: 10000 });
  const set = await api('post', `${root}/player-sets`, { name: 'Marquee Stars', sortOrder: 1 });
  for (const name of ['Arjun Star', 'Sameer Star']) await api('post', `${root}/players`, { name, playerSetId: set.id, basePrice: 500, position: 'Forward' });
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await owner.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const consolePage = await owner.newPage();
  const publicContext = await browser.newContext();
  const projector = await publicContext.newPage();
  const upcoming = await publicContext.newPage();
  const errors: string[] = [];
  for (const page of [consolePage, projector, upcoming]) page.on('pageerror', error => errors.push(error.message));
  consolePage.on('dialog', async dialog => { if (dialog.type() === 'alert') errors.push(dialog.message()); await dialog.accept(); });
  try {
    await consolePage.goto(root);
    await consolePage.getByRole('button', { name: 'Auction Rules & Purse' }).click();
    const toggle = consolePage.getByRole('checkbox', { name: 'Sell all players', exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await consolePage.getByRole('button', { name: /Save/ }).click();
    await expect(consolePage.getByText('Auction rules and purse limits successfully saved!')).toBeVisible();
    expect((await api('get', `${root}/settings`)).sellAllPlayers).toBe(true);
    await api('post', `${root}/preflight/approve-ready`);
    await Promise.all([consolePage.goto(`${root}/auction`), projector.goto(`${root}/projector`)]);
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    await consolePage.getByRole('button', { name: 'Launch Auction' }).click();
    await consolePage.getByRole('button', { name: /Marquee Stars/ }).click();
    const reveal = async () => {
      await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
      await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
      return (await api('get', `${root}/auction`)).currentLot;
    };
    const unsold = async () => {
      await consolePage.getByRole('button', { name: /MARK UNSOLD/ }).click();
      await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toHaveCount(0);
    };
    await reveal(); await unsold();
    await reveal(); await unsold();
    await consolePage.getByRole('button', { name: 'Complete Active Set', exact: true }).click();
    await consolePage.getByRole('button', { name: 'Close set summary' }).click();
    await consolePage.getByRole('button', { name: /Launch Unsold Rounds/ }).click();
    await upcoming.goto(`/live/${tournament.slug}?view=players`);
    await expect(upcoming.getByTestId(`upcoming-set-${set.id}`)).toContainText('2 pending');
    const repeat = await reveal();
    expect(repeat.attemptNumber).toBe(2);
    await unsold();
    await expect(upcoming.getByTestId('upcoming-retry-pool')).toContainText('Next unsold round');
    await expect(upcoming.getByTestId('upcoming-retry-pool')).toContainText(repeat.playerName);
    await expect(upcoming.getByTestId(`upcoming-set-${set.id}`)).toContainText('1 pending');
    const sale = await reveal();
    await consolePage.getByRole('button', { name: /Falcons FC FFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1000');
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toHaveCount(0);
    await expect(projector.locator('.stage-setline')).toContainText('Unsold Round 2');
    await expect(upcoming.getByTestId('upcoming-retry-pool')).toHaveCount(0);
    await expect(upcoming.getByTestId(`upcoming-set-${set.id}`)).toContainText('1 pending');
    await Promise.all([consolePage.reload(), projector.reload()]);
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    const third = await reveal();
    expect(third.playerId).toBe(repeat.playerId);
    expect(third.attemptNumber).toBe(3);
    const blocked = await request.post(`${API}/api${root}/auction/complete`, { headers, data: { overrideReason: 'Cannot bypass sell all' } });
    expect(blocked.status()).toBe(400);
    await unsold();
    await expect(projector.locator('.stage-setline')).toContainText('Unsold Round 3');
    const fourth = await reveal();
    expect(fourth.playerId).toBe(repeat.playerId);
    expect(fourth.attemptNumber).toBe(4);
    expect(fourth.basePrice).toBe(repeat.basePrice);
    await consolePage.getByRole('button', { name: /Warriors FC WFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1500');
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹1,500');
    await consolePage.getByRole('button', { name: /Conclude & Complete/ }).click();
    await expect(projector.getByTestId('stage-status')).toHaveText('Auction complete');
    const history = await api('get', `${root}/auction/history`);
    expect(history.attempts.filter((lot: { playerId: string }) => lot.playerId === repeat.playerId)).toHaveLength(4);
    expect(history.attempts.filter((lot: { playerId: string }) => lot.playerId === sale.playerId)).toHaveLength(2);
    const resultsResponse = await request.get(`${API}/api/public/tournaments/${tournament.slug}/results`);
    const results = await resultsResponse.json();
    expect(results.statistics.soldPlayers).toBe(2);
    expect(results.statistics.unsoldPlayers).toBe(0);
    expect(results.statistics.totalSpent).toBe(2500);
    await consolePage.goto(root);
    await consolePage.getByRole('button', { name: 'Auction Rules & Purse' }).click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
    const seededResponse = await request.get(`${API}/api/public/tournaments/malabar-champions-trophy-2026/auction-state`);
    expect((await seededResponse.json()).sellAllPlayers).toBe(false);
    expect(errors).toEqual([]);
    console.log(`Verified continuous-round tournament: ${tournament.id}; teams ${first.id}, ${second.id}`);
  } finally { await Promise.all([owner.close(), publicContext.close()]); }
});
