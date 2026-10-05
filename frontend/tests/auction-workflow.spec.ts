import { test, expect } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';

test('final-round attempts, history corrections and a shareable projector link', async ({ browser, request }, testInfo) => {
  const registration = await request.post(`${API}/api/auth/register`, { data: {
    email: `milestone8-${Date.now()}@example.test`, password: 'Milestone8Test!2026', fullName: 'Workflow Verification',
  } });
  expect(registration.ok()).toBeTruthy();
  const { token } = await registration.json();
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Milestone 8 Workflow Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  await api('put', `${root}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000,
    minimumSquadSize: 1, maximumSquadSize: 4, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true });
  const first = await api('post', `${root}/teams`, { name: 'Falcons FC', shortName: 'FFC', initialPurse: 10000 });
  const second = await api('post', `${root}/teams`, { name: 'Warriors FC', shortName: 'WFC', initialPurse: 10000 });
  const set1 = await api('post', `${root}/player-sets`, { name: 'Marquee Stars', sortOrder: 1 });
  const set2 = await api('post', `${root}/player-sets`, { name: 'Development Players', sortOrder: 2 });
  await api('post', `${root}/players`, { name: 'Reauction Star', playerSetId: set1.id, basePrice: 500, position: 'Forward' });
  await api('post', `${root}/players`, { name: 'Development Star', playerSetId: set2.id, basePrice: 500, position: 'Defender' });
  await api('post', `${root}/preflight/approve-ready`);
  const organizer = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await organizer.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const consolePage = await organizer.newPage();
  const history = await organizer.newPage();
  const publicContext = await browser.newContext();
  const projector = await publicContext.newPage();
  const errors: string[] = [];
  for (const page of [consolePage, history, projector]) page.on('pageerror', error => errors.push(error.message));
  consolePage.on('dialog', async dialog => {
    if (dialog.type() === 'alert') errors.push(dialog.message());
    await dialog.accept(dialog.type() === 'prompt' ? 'Owner approved verified squad shortfall' : undefined);
  });
  try {
    await consolePage.goto(`${root}/auction`);
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    await consolePage.getByRole('button', { name: 'Copy Projector Link' }).click();
    await expect(consolePage.getByText('Projector link copied')).toBeVisible();
    const shareUrl = await consolePage.evaluate(() => navigator.clipboard.readText());
    expect(shareUrl).toBe(new URL(`${root}/projector`, consolePage.url()).href);
    await projector.goto(shareUrl);
    await expect(projector.getByRole('status')).toContainText('Live connection');
    expect(await projector.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    await history.goto(`${root}/auction/history`);
    await expect(history.getByRole('status')).toContainText('Live connection');
    await consolePage.getByRole('button', { name: 'Launch Auction' }).click();
    await consolePage.getByRole('button', { name: /Marquee Stars/ }).click();
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    const original = (await api('get', `${root}/auction`)).currentLot;
    await consolePage.getByRole('button', { name: /MARK UNSOLD/ }).click();
    await expect(history.getByTestId(`attempt-${original.lotId}`)).toContainText('UNSOLD');
    await consolePage.getByRole('button', { name: 'Complete Active Set', exact: true }).click();
    await expect(consolePage.getByRole('dialog', { name: 'Set summary' })).toBeVisible();
    await consolePage.getByRole('button', { name: 'Close set summary' }).click();
    await expect(consolePage.getByRole('button', { name: /Launch Mandatory/ })).toHaveCount(0);
    const premature = await request.post(`${API}/api${root}/auction/unsold-round/start`, { headers });
    expect(premature.status()).toBe(400);
    await consolePage.getByRole('button', { name: /Development Players/ }).click();
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    await consolePage.getByRole('button', { name: /Warriors FC WFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1000');
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹1,000');
    await consolePage.getByRole('button', { name: 'Complete Active Set', exact: true }).click();
    await consolePage.getByRole('button', { name: 'Close set summary' }).click();
    await consolePage.getByRole('button', { name: /Launch Mandatory Final Unsold Round/ }).click();
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    const retry = (await api('get', `${root}/auction`)).currentLot;
    expect(retry.playerId).toBe(original.playerId);
    expect(retry.attemptNumber).toBe(2);
    expect(retry.basePrice).toBe(original.basePrice);
    await consolePage.getByRole('button', { name: /Falcons FC FFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('9000');
    await consolePage.getByRole('button', { name: /SOLD TO/ }).click();
    await expect(history.getByTestId(`attempt-${retry.lotId}`)).toContainText('Attempt 2');
    await expect(history.getByTestId(`attempt-${original.lotId}`)).toContainText('UNSOLD');
    const correct = async (teamId: string, price: string, reason: string) => {
      await history.getByRole('button', { name: 'Correct result', exact: true }).click();
      const modal = history.getByRole('dialog', { name: 'Correct Auction Result' });
      await modal.getByLabel('Correct Winning Team').selectOption(teamId);
      await modal.getByLabel(/Correct Final Price/).fill(price);
      await modal.getByLabel('Audit Reason (Required)').fill(reason);
      await modal.getByRole('button', { name: 'Commit Correction' }).click();
      await expect(modal).toBeHidden();
      await expect(history.getByTestId('audit-event').filter({ hasText: reason })).toHaveCount(1);
    };
    await correct(first.id, '9500', 'Same-team price corrected after refund');
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹9,500');
    await correct(second.id, '1250', 'Corrected winning paddle to Warriors');
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹1,250');
    await expect(history.getByTestId('attempt-' + retry.lotId)).toContainText('Warriors FC');
    const state = await api('get', `${root}/auction`);
    expect(state.totalSoldPlayersCount).toBe(2);
    expect(state.totalUnsoldPlayersCount).toBe(0);
    expect(state.teamStandings.find((team: { teamId: string }) => team.teamId === first.id).remainingPurse).toBe(10000);
    expect(state.teamStandings.find((team: { teamId: string }) => team.teamId === second.id).remainingPurse).toBe(7750);
    await history.reload();
    await expect(history.getByTestId(`attempt-${original.lotId}`)).toContainText('Attempt 1');
    await expect(history.getByTestId(`attempt-${retry.lotId}`)).toContainText('₹1,250');
    await history.getByLabel('Filter attempts').selectOption('ROUND_2');
    await expect(history.getByTestId(`attempt-${original.lotId}`)).toHaveCount(0);
    await expect(history.getByTestId(`attempt-${retry.lotId}`)).toBeVisible();
    await history.getByLabel('Filter attempts').selectOption('ALL');
    await history.getByLabel('Search auction history').fill('Reauction');
    await expect(history.locator('tbody tr')).toHaveCount(2);
    await history.screenshot({ path: testInfo.outputPath('auction-history.png'), fullPage: true });
    await consolePage.getByRole('button', { name: /Conclude & Complete/ }).click();
    await expect(history.getByTestId('audit-event').filter({ hasText: 'Owner approved verified squad shortfall' })).toHaveCount(1);
    await expect(history.getByRole('button', { name: 'Correct result', exact: true })).toHaveCount(0);
    await expect(projector.getByTestId('stage-status')).toContainText('complete', { ignoreCase: true });
    const attempts = (await api('get', `${root}/auction/history`)).attempts;
    expect(attempts).toHaveLength(3);
    expect(attempts.find((lot: { lotId: string }) => lot.lotId === original.lotId).status).toBe('UNSOLD');
    const anonymous = await request.get(`${API}/api${root}/auction/history`);
    expect(anonymous.status()).toBe(401);
    const outsiderRegistration = await request.post(`${API}/api/auth/register`, { data: {
      email: `outsider8-${Date.now()}@example.test`, password: 'Milestone8Test!2026', fullName: 'Outsider',
    } });
    const outsider = await outsiderRegistration.json();
    for (const path of ['history', 'events']) {
      const denied = await request.get(`${API}/api${root}/auction/${path}`, { headers: { Authorization: `Bearer ${outsider.token}` } });
      expect(denied.status()).toBe(403);
    }
    expect(errors).toEqual([]);
  } finally { await Promise.all([organizer.close(), publicContext.close()]); }
});
