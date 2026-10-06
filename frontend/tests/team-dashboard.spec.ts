import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';

const teamId = '11111111-1111-1111-1111-111111111111';
const tournamentId = '22222222-2222-2222-2222-222222222222';
const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lime"/></svg>');
function fixture() {
  const standing = { teamId, teamName: 'Falcons Football Club', shortName: 'FLC', primaryColor: '#10B981', logoUrl: logo,
    initialPurse: 10000, totalSpent: 2000, remainingPurse: 8000, currentSquadSize: 1, minimumSquadSize: 3, maximumSquadSize: 5,
    remainingSlotsToMinSquad: 2, maxSlotsAvailable: 4, requiredReserveForMinSquad: 1000, maximumAllowedBid: 7000, canBid: true };
  const players = ['SOLD','ON_AUCTION','AVAILABLE','UNSOLD','AVAILABLE'].map((status, i) => ({ playerId: `player-${i}`, playerName: ['Signed Star','Active Forward','Next Keeper','Returning Defender','Future Midfielder'][i], photoUrl: logo,
    position: 'Forward', age: 21, preferredFoot: 'Right', jerseyNumber: null, playerSetId: i < 4 ? 'set-a' : 'set-b', playerSetName: i < 4 ? 'First Set' : 'Second Set', basePrice: 500,
    status, attemptCount: status === 'SOLD' || status === 'ON_AUCTION' || status === 'UNSOLD' ? 1 : 0,
    winningTeamId: status === 'SOLD' ? teamId : null, winningTeamName: status === 'SOLD' ? standing.teamName : null, finalPrice: status === 'SOLD' ? 2000 : null, pricePremium: null, priceMultiplier: null }));
  const lot = { ...players[1], lotId: 'lot-active', status: 'ON_AUCTION', attemptNumber: 1, currentBid: 700, leadingTeamId: teamId,
    cardPosition:'ST', ratings:{overall:91,isGoalkeeper:false,attributes:{pace:96,shooting:96,passing:80,dribbling:88,defending:60,physical:94}} };
  const state = { tournamentId, tournamentName: 'Champions Trophy 2026', slug: 'demo', currencyCode: 'INR', currencySymbol: '₹', sessionStatus: 'LIVE', version: 1,
    sellAllPlayers: true, currentAttemptNumber: 1, isUnsoldRound: false, currentSetName: 'First Set', currentLot: lot as typeof lot | null, lastResult: null as typeof lot | null,
    currentSetSummary: { setId: 'set-a', setName: 'First Set', totalPlayersInSet: 4, soldCount: 1, unsoldCount: 1, remainingCount: 1, totalSpentInSet: 2000 },
    totalPlayersCount: 5, totalSoldPlayersCount: 1, totalUnsoldPlayersCount: 1, teamStandings: [standing], soldPlayers: [{ ...players[0], lotId: 'lot-sold', attemptNumber: 1 }] };
  const statistics = { totalPlayers: 5, soldPlayers: 1, unsoldPlayers: 1, availablePlayers: 3, salePercentage: 20, totalSpent: 2000,
    teams: [{ standing, averagePlayerCost: 2000, mostExpensiveSigning: players[0], positions: [{ position: 'Forward', playerCount: 1, totalSpent: 2000 }] }],
    sets: [{ setId: 'set-a', setName: 'First Set', sortOrder: 0 },{ setId: 'set-b', setName: 'Second Set', sortOrder: 1 }], topPlayers: [players[0]] };
  return { state, statistics, players, publicLiveViewEnabled: true, tournamentLogoUrl: null };
}
async function mock(page: Page, data: ReturnType<typeof fixture>) {
  await page.route('**/api/public/tournaments/**', route => route.fulfill({ json: route.request().url().includes('auction-state') ? data.state : data }));
  await page.route('**/hubs/auction/negotiate*', route => route.fulfill({ json: { negotiateVersion: 1, connectionId: 'test', connectionToken: 'test', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text','Binary'] }] } }));
  let notify = () => {};
  await page.routeWebSocket('**/hubs/auction*', socket => {
    socket.onMessage(message => {
      for (const part of String(message).split('\u001e').filter(Boolean)) {
        const frame = JSON.parse(part);
        if (frame.protocol) socket.send('{}\u001e');
        if (frame.type === 1 && frame.invocationId) socket.send(JSON.stringify({ type: 3, invocationId: frame.invocationId }) + '\u001e');
      }
    });
    notify = () => socket.send(JSON.stringify({ type: 1, target: 'TeamUpdated', arguments: [] }) + '\u001e');
  });
  return () => notify();
}
async function expectCardStatsToFit(page: Page) {
  const card=page.locator('.football-player-card');
  const stats=await card.locator('.football-card-attributes').boundingBox();
  const footer=await card.locator('.football-card-signature').boundingBox();
  expect(stats!.y+stats!.height).toBeLessThan(footer!.y);
  for(const row of await card.locator('.football-card-attributes>div').all()) {
    const rowBox=await row.boundingBox();
    for(const text of await row.locator('dt,dd').all()) {
      const box=await text.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(rowBox!.y-1);
      expect(box!.y+box!.height).toBeLessThanOrEqual(rowBox!.y+rowBox!.height+1);
      expect(box!.x+box!.width).toBeLessThanOrEqual(rowBox!.x+rowBox!.width+1);
    }
  }
}
test('franchise dashboard explains finances, slots, signings, remaining sets and live updates', async ({ page }) => {
  const data = fixture(); const notify = await mock(page, data);
  await page.goto(`/live/demo/teams/${teamId}`);
  await expect(page.getByRole('heading', { name: 'Falcons Football Club' })).toBeVisible();
  await expect(page.getByTestId('franchise-purse')).toHaveText('₹8,000');
  await expect(page.getByTestId('franchise-minimum-slots')).toHaveText('2');
  await expect(page.getByTestId('franchise-open-slots')).toHaveText('4');
  await expect(page.getByTestId('franchise-signing-player-0')).toContainText('Signed Star');
  await expect(page.getByRole('heading', { name: 'Remaining player pool' })).toBeVisible();
  await expect(page.getByTestId('upcoming-player-player-2')).toBeVisible();
  await expect(page.getByTestId('upcoming-player-player-4')).toBeVisible();
  await expect(page.getByTestId('upcoming-retry-pool')).toContainText('First Set');
  await expect(page.getByText('Live connection', { exact: true })).toBeVisible();
  data.statistics.teams[0].standing.remainingPurse = 6000;
  notify();
  await expect(page.getByTestId('franchise-purse')).toHaveText('₹6,000');
  await page.screenshot({ path: '../.cache/franchise-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByTestId('franchise-purse')).toBeVisible();
    const nameBox = await page.getByTestId('franchise-signing-player-0').locator('h3').boundingBox();
    expect(nameBox!.width).toBeGreaterThan(80);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '../.cache/franchise-mobile.png', fullPage: true });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await expect(page.locator('.franchise-budget')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
});
test('completed franchises show final outcomes and recap, not an upcoming pool', async ({ page }) => {
  const data = fixture(); data.state.sessionStatus = 'COMPLETED'; data.state.currentLot = null;
  await mock(page, data); await page.goto(`/live/demo/teams/${teamId}`);
  await expect(page.getByRole('heading', { name: 'The auction is complete' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Explore the auction recap' })).toHaveAttribute('href', '/live/demo/recap');
  await expect(page.getByRole('heading', { name: 'Upcoming players' })).toHaveCount(0);
});
test('projector fits laptop viewports with the player, progress and ticker visible', async ({ page }) => {
  const data = fixture();
  data.state.teamStandings = Array.from({ length: 10 }, (_, i) => ({ ...data.state.teamStandings[0], teamId: `team-${i}`, teamName: `Franchise ${i}`, shortName: `T${i}` }));
  data.state.currentLot!.leadingTeamId = 'team-0';
  data.state.soldPlayers[0].winningTeamId = 'team-0';
  const notify = await mock(page, data); await page.goto('/live/demo/projector');
  for (const size of [{ width: 1366, height: 650 }, { width: 1280, height: 600 }, { width: 1024, height: 600 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await expect(page.getByTestId('stage-player')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    for (const selector of ['.stage-bid', '.stage-progress', '.stage-ticker']) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    }
    await expect(page.locator('.stage-portrait .football-card-photo img')).toHaveCSS('object-fit', 'contain');
    await expect(page.getByLabel('Overall 91')).toHaveText('91');
    await expect(page.getByLabel('Physical 94')).toBeVisible();
    await expectCardStatsToFit(page);
    expect(await page.locator('.stage-team-list').evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    for (const card of await page.locator('.stage-team').all()) {
      const box = await card.boundingBox();
      const list = await page.locator('.stage-team-list').boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(list!.y - 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(list!.y + list!.height + 1);
    }
  }
  await page.setViewportSize({ width: 1366, height: 650 });
  await page.screenshot({ path: '../.cache/projector-laptop.png' });
  await expect(page.getByText('Live connection', { exact: true })).toBeVisible();
  for (const count of [4,24,32]) {
    data.state.teamStandings = Array.from({ length: count }, (_, i) => ({ ...data.state.teamStandings[0], teamId: `team-${i}`, teamName: `Franchise ${i}`, shortName: `T${i}`, remainingPurse: 98000 }));
    await page.setViewportSize({ width: 1024, height: 600 }); notify();
    await expect(page.locator('.stage-team')).toHaveCount(count);
    expect(await page.locator('.stage-team-list').evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
    for (const card of await page.locator('.stage-team').all()) {
      const box = await card.boundingBox(); const list = await page.locator('.stage-team-list').boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(list!.y + list!.height + 1);
    }
  }
  data.state.teamStandings = data.state.teamStandings.slice(0,10); notify();
  await expect(page.locator('.stage-team')).toHaveCount(10);
  await page.setViewportSize({ width: 1366, height: 650 });
  data.state.lastResult = { ...data.state.currentLot!, status: 'SOLD', winningTeamId: 'team-0', winningTeamName: 'Franchise 0', finalPrice: 2000 };
  data.state.currentLot = null;
  notify();
  await expect(page.getByTestId('stage-result')).toContainText('SOLD');
  const sold = await page.getByTestId('stage-result').boundingBox();
  const progress = await page.locator('.stage-progress').boundingBox();
  expect(sold!.y + sold!.height).toBeLessThanOrEqual(progress!.y);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expectCardStatsToFit(page);
  await page.locator('.football-player-card').screenshot({path:'../.cache/player-card-detail.png'});
  await page.screenshot({path:'../.cache/projector-card-mobile.png',fullPage:true});
  for(const width of [150,180,300]) {
    await page.locator('.football-player-card').evaluate((node,size)=>{const element=node as HTMLElement; element.style.width=`${size}px`;},width);
    await expectCardStatsToFit(page);
  }
});
