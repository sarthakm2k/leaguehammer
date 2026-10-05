import { test, expect } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';

test('Sell all players rejects spending that strands an expensive player in a later set', async ({ browser, request }) => {
  const registered = await request.post(`${API}/api/auth/register`, { data: {
    email: `purse-protection-${Date.now()}@example.test`, password: 'PurseProtection!2026', fullName: 'Purse Protection Verification',
  } });
  expect(registered.ok()).toBeTruthy();
  const { token } = await registered.json();
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Purse Protection Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  await api('put', `${root}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000,
    minimumSquadSize: 1, maximumSquadSize: 2, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true, sellAllPlayers: true });
  const first = await api('post', `${root}/teams`, { name: 'Falcons FC', shortName: 'FFC', initialPurse: 2000 });
  const second = await api('post', `${root}/teams`, { name: 'Warriors FC', shortName: 'WFC', initialPurse: 4000 });
  const cheap = await api('post', `${root}/player-sets`, { name: 'Opening Players', sortOrder: 1 });
  const expensive = await api('post', `${root}/player-sets`, { name: 'Premium Player', sortOrder: 2 });
  for (const name of ['Opening One', 'Opening Two', 'Opening Three'])
    await api('post', `${root}/players`, { name, playerSetId: cheap.id, basePrice: 500, position: 'Forward' });
  await api('post', `${root}/players`, { name: 'Expensive Last Player', playerSetId: expensive.id, basePrice: 3000, position: 'Forward' });
  await api('post', `${root}/preflight/approve-ready`);
  await api('post', `${root}/auction/start`);
  await api('post', `${root}/auction/start-set`, { setId: cheap.id });
  for (let i = 0; i < 2; i++) {
    const lot = (await api('post', `${root}/auction/reveal-next`)).currentLot;
    await api('post', `${root}/auction/sell`, { lotId: lot.lotId, winningTeamId: first.id, finalPrice: 500 });
  }
  const state = await api('post', `${root}/auction/reveal-next`);
  const owner = await browser.newContext();
  await owner.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const consolePage = await owner.newPage();
  const alerts: string[] = [];
  const errors: string[] = [];
  consolePage.on('pageerror', error => errors.push(error.message));
  consolePage.on('dialog', async dialog => { if (dialog.type() === 'alert') alerts.push(dialog.message()); await dialog.accept(); });
  try {
    await consolePage.goto(`${root}/auction`);
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    await expect(consolePage.getByText('The team purse limit alone does not guarantee a bid can be accepted.', { exact: false })).toBeVisible();
    await consolePage.getByRole('button', { name: /Warriors FC WFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1500');
    await consolePage.getByRole('button', { name: 'Update Live Bid', exact: true }).click();
    await expect.poll(() => alerts.length).toBe(1);
    expect(alerts[0]).toContain('actual base prices');
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect.poll(() => alerts.length).toBe(2);
    expect(alerts[1]).toContain('actual base prices');
    const unchanged = await api('get', `${root}/auction`);
    expect(unchanged.version).toBe(state.version);
    expect(unchanged.currentLot.lotId).toBe(state.currentLot.lotId);
    expect(unchanged.teamStandings.find((team: { teamId: string }) => team.teamId === second.id).remainingPurse).toBe(4000);
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1000');
    await consolePage.getByRole('button', { name: 'Update Live Bid', exact: true }).click();
    await expect.poll(async () => (await api('get', `${root}/auction`)).currentLot.currentBid).toBe(1000);
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(consolePage.getByRole('heading', { name: 'All players in this set are done' })).toBeVisible();
    await consolePage.getByRole('button', { name: 'Go to Next Set: Premium Player', exact: true }).click();
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('heading', { name: 'Expensive Last Player', exact: true })).toBeVisible();
    await consolePage.getByRole('button', { name: /Warriors FC WFC/ }).click();
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await consolePage.getByRole('button', { name: 'Complete Active Set', exact: true }).click();
    await consolePage.getByRole('button', { name: 'Close set summary' }).click();
    await consolePage.getByRole('button', { name: /Conclude & Complete/ }).click();
    const completed = await api('get', `${root}/auction`);
    expect(completed.sessionStatus).toBe('COMPLETED');
    expect(completed.totalSoldPlayersCount).toBe(4);
    expect(completed.teamStandings.find((team: { teamId: string }) => team.teamId === second.id).remainingPurse).toBe(0);
    expect(alerts).toHaveLength(2);
    expect(errors).toEqual([]);
  } finally { await owner.close(); }
});
