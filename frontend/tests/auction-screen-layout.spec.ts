import { test, expect, type Page } from 'playwright/test';

function fixture(count: number) {
  const teamStandings = Array.from({ length: count }, (_, index) => ({ teamId: `team-${index}`, teamName: `Franchise ${index + 1}`, shortName: `FC${index + 1}`, primaryColor: '#b7ef59', initialPurse: 100000, remainingPurse: 85000, totalSpent: 15000, currentSquadSize: 3, minimumSquadSize: 8, maximumSquadSize: 12, maximumAllowedBid: 80000, canBid: true }));
  const currentLot = { lotId: 'lot', sessionId: 'session', playerId: 'player', playerName: 'Arjun Menon', photoUrl: null, position: 'Forward', cardPosition: 'ST', age: 24, preferredFoot: 'Right', basePrice: 500, currentBid: 1500, leadingTeamId: 'team-0', drawPosition: 1, playerSetName: 'Elite Forwards', attemptNumber: 1, status: 'ON_AUCTION', ratings: { overall: 91, isGoalkeeper: false, attributes: { pace: 96, shooting: 96, passing: 80, dribbling: 88, defending: 60, physical: 94 } } };
  return { tournamentId: 'screen-cup', tournamentName: 'Malabar Champions Trophy 2026', slug: 'screen-cup', sessionStatus: 'LIVE', version: 1, currencyCode: 'INR', currencySymbol: '₹', defaultBidIncrement: 100, sellAllPlayers: true, currentSetName: 'Elite Forwards', currentSetId: 'set', currentLot, lastResult: null, totalSpentAcrossTournament: 180000, totalPlayersCount: 96, totalSoldPlayersCount: 30, totalUnsoldPlayersCount: 2, teamStandings, soldPlayers: [], completedSetIds: [] };
}

async function setup(page: Page, state: ReturnType<typeof fixture>, operator: boolean) {
  if (operator) await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner' } });
    if (path.endsWith('/player-sets')) return route.fulfill({ json: [] });
    if (path.endsWith('/screen-cup')) return route.fulfill({ json: { userRole: 'OWNER' } });
    return route.fulfill({ json: state });
  });
  await page.route('**/hubs/auction/negotiate*', route => route.fulfill({ json: { negotiateVersion: 1, connectionId: 'test', connectionToken: 'test', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }] } }));
  await page.routeWebSocket('**/hubs/auction*', socket => socket.onMessage(message => {
    for (const part of String(message).split('\u001e').filter(Boolean)) {
      const frame = JSON.parse(part);
      if (frame.protocol) socket.send('{}\u001e');
      if (frame.type === 1 && frame.invocationId) socket.send(JSON.stringify({ type: 3, invocationId: frame.invocationId }) + '\u001e');
    }
  }));
  await page.goto(operator ? '/tournaments/screen-cup/auction' : '/live/screen-cup/projector');
  await expect(page.getByText('Live connection', { exact: true })).toBeVisible();
}

async function fitsViewport(page: Page, selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}

test('auction controls fit laptop screens while long team lists stay inside their panels', async ({ page }) => {
  await setup(page, fixture(12), true);
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 650 }, { width: 1536, height: 864 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.football-player-card', '.console-sale-actions', '.console-bid-controls', '.console-purse-panel']) await fitsViewport(page, selector);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    await expect(page.getByRole('button', { name: 'Update Live Bid' })).toBeEnabled();
    await expect(page.getByRole('button', { name: /SOLD TO FC1/ })).toBeEnabled();
    expect(await page.locator('.console-team-options>button').first().evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    if (viewport.width === 1366) await page.screenshot({ path: '../testscreenshots/auctioneer-laptop.png' });
  }
});

test('projector scales to full HD and 4K with every team visible and no team scrolling', async ({ page }) => {
  await setup(page, fixture(12), false);
  const cardWidths: number[] = [];
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['.stage-main', '.stage-team-list', '.stage-ticker', '.football-player-card']) await fitsViewport(page, selector);
    for (const team of await page.locator('.stage-team').all()) {
      const box = await team.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.locator('.stage-team-list').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    cardWidths.push((await page.locator('.football-player-card').boundingBox())!.width);
    if (viewport.width !== 1366) await page.screenshot({ path: `../testscreenshots/projector-${viewport.width}.png` });
  }
  expect(cardWidths[1]).toBeGreaterThan(cardWidths[0] * 1.2);
  expect(cardWidths[2]).toBeGreaterThan(cardWidths[1] * 1.8);
});

test('mobile operator layout retains page scrolling and usable bid controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page, fixture(4), true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Update Live Bid' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Update Live Bid' })).toBeVisible();
});

test('sold projector result and 24 franchises fit a large display in light mode', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  const active = fixture(24);
  const result = { ...active.currentLot, status: 'SOLD', winningTeamId: 'team-0', winningTeamName: 'Franchise 1', finalPrice: 1500 };
  // Retain the fixture's shape while serving the public sold-result state.
  const state = { ...active, currentLot: null, lastResult: result };
  await setup(page, state as unknown as ReturnType<typeof fixture>, false);
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await expect(page.getByTestId('stage-result')).toBeVisible();
  for (const selector of ['.stage-result', '.football-player-card', '.stage-team-list']) await fitsViewport(page, selector);
  expect(await page.locator('.stage-team-list').evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  await expect(page.locator('.stage-team')).toHaveCount(24);
});
