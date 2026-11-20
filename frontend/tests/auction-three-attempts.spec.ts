import { test, expect, type Page } from 'playwright/test';
import type { AuctionLotDto, AuctionStateDto } from '../src/features/auction/auctionTypes';

function lot(attempt: number): AuctionLotDto {
  return { lotId: `attempt-${attempt}`, sessionId: 'session', playerId: 'player', playerName: 'Arjun Menon',
    playerSetId: 'set', playerSetName: 'Marquee', photoUrl: null, position: 'Forward', basePrice: 500,
    attemptNumber: attempt, drawPosition: 1, status: 'UNSOLD', finalPrice: null, winningTeamId: null,
    currentBid: null, leadingTeamId: null } as AuctionLotDto;
}

function fixture(attempt = 1): AuctionStateDto {
  return { tournamentId: 'three-attempts', tournamentName: 'Three Attempt Cup', slug: 'three-attempts',
    sessionStatus: 'LIVE', version: 1, currencyCode: 'INR', currencySymbol: '₹', defaultBidIncrement: 100,
    minimumAcquisitionPrice: 500, sellAllPlayers: false, isUnsoldRound: attempt > 1, currentAttemptNumber: attempt,
    currentSetId: null, currentSetName: attempt === 3 ? 'Final Unsold Round' : attempt === 2 ? 'Unsold Round 1' : null,
    currentLot: null, lastResult: lot(attempt), totalSpentAcrossTournament: 0, totalPlayersCount: 1, totalSoldPlayersCount: 0, totalUnsoldPlayersCount: 1,
    completedSetsCount: 1, totalSetsCount: 1, completedSetIds: ['set'], unsoldRoundRemainingCount: 0,
    soldPlayers: [], teamStandings: [{ teamId: 'team', teamName: 'Falcons', shortName: 'FLC', primaryColor: '#10b981',
      initialPurse: 10000, remainingPurse: 10000, totalSpent: 0, currentSquadSize: 0, minimumSquadSize: 1,
      maximumSquadSize: 4, maximumAllowedBid: 10000, canBid: true }] } as AuctionStateDto;
}

async function setup(page: Page, state: AuctionStateDto) {
  const writes: string[] = [];
  await page.addInitScript(() => localStorage.setItem('auth_token', 'test-token'));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner' } });
    if (path.endsWith('/player-sets') || path.endsWith('/events')) return route.fulfill({ json: [] });
    if (path.endsWith('/history')) return route.fulfill({ json: { attempts: [lot(2), lot(3)] } });
    if (path.endsWith('/three-attempts')) return route.fulfill({ json: { userRole: 'OWNER' } });
    if (route.request().method() === 'POST') {
      writes.push(path);
      if (path.endsWith('/unsold-round/start')) {
        state.currentAttemptNumber = (state.currentAttemptNumber ?? 1) + 1;
        state.isUnsoldRound = true;
        state.currentSetName = state.currentAttemptNumber === 3 ? 'Final Unsold Round' : 'Unsold Round 1';
        state.unsoldRoundRemainingCount = 1;
      } else if (path.endsWith('/reveal-next')) {
        state.currentLot = { ...lot(state.currentAttemptNumber ?? 1), status: 'ON_AUCTION' };
      } else if (path.endsWith('/unsold')) {
        state.lastResult = { ...state.currentLot!, status: 'UNSOLD' };
        state.currentLot = null;
        state.unsoldRoundRemainingCount = 0;
      } else if (path.endsWith('/complete')) state.sessionStatus = 'COMPLETED';
      state.version++;
    }
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
  return writes;
}

test('operator launches both unsold rounds and only sees completion after the third attempt', async ({ page }) => {
  const state = fixture();
  const writes = await setup(page, state);
  const confirmations: string[] = [];
  page.on('dialog', dialog => { confirmations.push(dialog.message()); void dialog.accept(); });
  await page.goto('/tournaments/three-attempts/auction');
  await expect(page.getByRole('button', { name: /Conclude & Complete/ })).toBeDisabled();
  await page.getByRole('button', { name: /Launch Unsold Round 1/ }).click();
  for (const attempt of [2, 3]) {
    await page.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await page.getByRole('button', { name: /MARK UNSOLD/ }).click();
    if (attempt === 2) {
      await page.reload();
      await expect(page.getByRole('button', { name: /Conclude & Complete/ })).toHaveCount(0);
      await page.getByRole('button', { name: /Launch Final Unsold Round \(Attempt 3\)/ }).click();
    }
  }
  await expect(page.getByRole('button', { name: /Launch.*Unsold/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Conclude & Complete/ }).click();
  expect(state.sessionStatus).toBe('COMPLETED');
  expect(writes.filter(path => path.endsWith('/unsold-round/start'))).toHaveLength(2);
  expect(confirmations[0]).toContain('Unsold Round 1');
  expect(confirmations.some(message => message.includes('third and final attempt'))).toBe(true);
});

for (const [attempt, continuous, result] of [[2, false, 'UNSOLD'], [3, false, 'FINAL UNSOLD'], [4, true, 'UNSOLD']] as const) {
  test(`projector labels attempt ${attempt} correctly with continuous rounds ${continuous}`, async ({ page }) => {
    const state = fixture(attempt); state.sellAllPlayers = continuous;
    await setup(page, state); await page.goto('/live/three-attempts/projector');
    await expect(page.getByTestId('stage-result')).toHaveText(result);
  });
}

test('history groups both unsold rounds and marks only the third attempt final', async ({ page }) => {
  const state = fixture(3); await setup(page, state);
  await page.goto('/tournaments/three-attempts/auction/history');
  await page.getByRole('combobox', { name: 'Filter attempts' }).selectOption({ label: 'Unsold rounds' });
  await expect(page.getByTestId('attempt-attempt-2')).not.toContainText('Final');
  await expect(page.getByTestId('attempt-attempt-3')).toContainText('UNSOLD · Final');
  state.sellAllPlayers = true; await page.reload();
  await expect(page.getByTestId('attempt-attempt-3')).not.toContainText('Final');
});
