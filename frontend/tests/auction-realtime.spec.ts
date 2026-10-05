import { test, expect } from 'playwright/test';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';

test('auctioneer and anonymous projector synchronize, refresh, and reconnect', async ({ browser, request }, testInfo) => {
  // Use a fresh test account/tournament; never mutate an organizer's existing auction.
  const registration = await request.post(`${API}/api/auth/register`, { data: {
    email: `milestone7-${Date.now()}@example.test`, password: 'Milestone7Test!2026', fullName: 'Realtime Verification',
  } });
  expect(registration.ok()).toBeTruthy();
  const { token } = await registration.json();
  const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Milestone 7 Broadcast Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  await api('put', `${root}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000,
    minimumSquadSize: 1, maximumSquadSize: 4, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: true });
  const falcons = await api('post', `${root}/teams`, { name: 'Falcons FC', shortName: 'FFC', primaryColor: '#b7f76b', initialPurse: 10000 });
  const warriors = await api('post', `${root}/teams`, { name: 'Warriors FC', shortName: 'WFC', primaryColor: '#69caff', initialPurse: 10000 });
  const set = await api('post', `${root}/player-sets`, { name: 'Marquee Stars', sortOrder: 1 });
  for (const [index, name] of ['Arjun Nair', 'Sameer Khan', 'Vivek Menon'].entries()) {
    await api('post', `${root}/players`, { name, playerSetId: set.id, basePrice: 500,
      age: 24 + index, position: ['Forward', 'Midfielder', 'Defender'][index], preferredFoot: 'Right', jerseyNumber: index + 7 });
  }
  await api('post', `${root}/preflight/approve-ready`);

  const operatorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await operatorContext.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const consolePage = await operatorContext.newPage();
  const secondOperatorContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await secondOperatorContext.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const secondConsole = await secondOperatorContext.newPage();
  const publicContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  // Observe the native browser socket, including reloads. This also verifies public payloads without relying on CDP events.
  await publicContext.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const sockets: WebSocket[] = [];
    const telemetry = {
      opened: 0,
      get closed() { return sockets.filter(socket => socket.readyState >= NativeWebSocket.CLOSING).length; },
      messages: [] as string[],
    };
    Object.assign(window, { auctionSocketTelemetry: telemetry });
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        if (!new URL(url.toString()).pathname.startsWith('/hubs/auction')) return;
        telemetry.opened++;
        sockets.push(this);
        this.addEventListener('message', event => telemetry.messages.push(String(event.data)));
      }
    };
  });
  const projector = await publicContext.newPage();
  const socketTelemetry = () => projector.evaluate(() => (window as unknown as {
    auctionSocketTelemetry: { opened: number; closed: number; messages: string[] };
  }).auctionSocketTelemetry);
  const errors: string[] = [];
  let negotiationAttempts = 0;
  await projector.route('**/hubs/auction/negotiate*', async route => {
    negotiationAttempts++;
    if (negotiationAttempts === 1) await route.fulfill({ status: 503, body: 'Temporary hub outage' });
    else await route.continue();
  });
  for (const page of [consolePage, secondConsole, projector]) page.on('pageerror', err => errors.push(err.message));
  try {
    await Promise.all([consolePage.goto(`${root}/auction`), secondConsole.goto(`${root}/auction`), projector.goto(`/live/${tournament.slug}/projector`)]);
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    await expect(secondConsole.getByRole('status')).toContainText('Live connection');
    await expect(projector.getByRole('status')).toContainText('Live connection');
    expect(negotiationAttempts).toBeGreaterThan(1);
    expect((await socketTelemetry()).opened).toBeGreaterThan(0);
    expect(await projector.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
    await consolePage.getByRole('button', { name: 'Launch Auction' }).click();
    await expect(projector.getByTestId('stage-status')).toHaveText('Live from the floor');
    await consolePage.getByRole('button', { name: /Marquee Stars/ }).click();
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    let state = await api('get', `${root}/auction`);
    await expect(projector.getByTestId('stage-player')).toHaveText(state.currentLot.playerName);
    await expect(secondConsole.getByRole('heading', { name: state.currentLot.playerName, exact: true })).toBeVisible();

    await consolePage.getByRole('button', { name: /Falcons FC FFC/ }).click();
    await consolePage.getByRole('spinbutton', { name: 'Winning bid price' }).fill('1500');
    await consolePage.getByRole('button', { name: 'Update Live Bid' }).click();
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹1,500');
    await expect(projector.locator('.stage-leading')).toContainText('Falcons FC');
    await expect(secondConsole.getByRole('spinbutton')).toHaveValue('1500');
    await projector.screenshot({ path: testInfo.outputPath('projector-live-1920x1080.png') });
    expect(await projector.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBeTruthy();

    await Promise.all([consolePage.reload(), projector.reload()]);
    await expect(consolePage.getByRole('spinbutton')).toHaveValue('1500');
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹1,500');
    await expect(consolePage.getByRole('status')).toContainText('Live connection');
    await consolePage.getByRole('button', { name: /SOLD TO FFC/ }).click();
    await expect(projector.getByTestId('stage-result')).toContainText('SOLD');
    await expect(projector.getByTestId('purse-FFC')).toHaveText('₹8,500');
    await expect(projector.locator('.stage-roster')).toContainText(state.currentLot.playerName);
    await expect(projector.locator('.stage-confetti')).toBeVisible();
    await expect(secondConsole.getByText(`${state.currentLot.playerName} SOLD!`)).toBeVisible();
    await projector.screenshot({ path: testInfo.outputPath('projector-sold-1920x1080.png') });
    await projector.reload();
    await expect(projector.getByTestId('stage-result')).toContainText('SOLD');
    await expect(projector.locator('.stage-confetti')).toHaveCount(0);

    await api('post', `${root}/auction/correct-result`, { lotId: state.currentLot.lotId, newWinningTeamId: warriors.id, newFinalPrice: 2000, reason: 'Private verification audit reason' });
    await expect(projector.getByTestId('purse-FFC')).toHaveText('₹10,000');
    await expect(projector.getByTestId('purse-WFC')).toHaveText('₹8,000');
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹2,000');
    await projector.getByRole('button', { name: /Warriors FC/ }).click();
    await expect(projector.locator('.stage-roster')).toContainText(state.currentLot.playerName);

    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    state = await api('get', `${root}/auction`);
    await expect(projector.getByTestId('stage-player')).toHaveText(state.currentLot.playerName);
    consolePage.once('dialog', dialog => dialog.accept());
    await consolePage.getByRole('button', { name: /MARK UNSOLD/ }).click();
    await expect(projector.getByTestId('stage-result')).toHaveText('UNSOLD');
    await expect(projector.getByTestId('purse-WFC')).toHaveText('₹8,000');

    // Miss events while offline, then recover canonical state and rejoin the group.
    const beforeOffline = await socketTelemetry();
    await publicContext.setOffline(true);
    await secondOperatorContext.setOffline(true);
    await expect(projector.getByRole('status')).toContainText('Connection lost', { timeout: 45000 });
    await expect(secondConsole.getByRole('status')).toContainText('Connection lost', { timeout: 45000 });
    await expect(secondConsole.getByRole('button', { name: /REVEAL NEXT PLAYER/ })).toBeDisabled();
    // Chrome can delay the close event while offline; CLOSING/CLOSED still confirms transport shutdown.
    await expect.poll(async () => (await socketTelemetry()).closed, { timeout: 45000 }).toBeGreaterThan(beforeOffline.closed);
    await consolePage.getByRole('button', { name: /REVEAL NEXT PLAYER/ }).click();
    await expect(consolePage.getByRole('spinbutton', { name: 'Winning bid price' })).toBeVisible();
    state = await api('get', `${root}/auction`);
    await api('post', `${root}/auction/bid`, { lotId: state.currentLot.lotId, currentBid: 2500, leadingTeamId: falcons.id });
    await api('post', `${root}/auction/pause`);
    await publicContext.setOffline(false);
    await secondOperatorContext.setOffline(false);
    await expect(projector.getByRole('status')).toContainText('Live connection', { timeout: 45000 });
    await expect.poll(async () => (await socketTelemetry()).opened, { timeout: 45000 }).toBeGreaterThan(beforeOffline.opened);
    await expect(secondConsole.getByRole('status')).toContainText('Live connection', { timeout: 45000 });
    await expect(projector.getByTestId('stage-player')).toHaveText(state.currentLot.playerName);
    await expect(projector.getByTestId('stage-bid')).toHaveText('₹2,500');
    await expect(projector.getByTestId('stage-status')).toHaveText('Auction paused');
    await expect(consolePage.getByRole('button', { name: /SOLD TO/ })).toBeDisabled();
    await api('post', `${root}/auction/resume`);
    const concurrentSales = await Promise.all([1, 2].map(() => request.post(`${API}/api${root}/auction/sell`, {
      headers, data: { lotId: state.currentLot.lotId, winningTeamId: falcons.id, finalPrice: 2500 },
    })));
    expect(concurrentSales.filter(response => response.status() === 200)).toHaveLength(1);
    expect([400, 409]).toContain(concurrentSales.find(response => response.status() !== 200)!.status());
    await expect(projector.getByTestId('stage-result')).toContainText('SOLD');
    await expect(projector.getByTestId('purse-FFC')).toHaveText('₹7,500');
    await api('post', `${root}/auction/sets/${set.id}/complete`);
    await expect(secondConsole.getByRole('heading', { name: 'Marquee Stars', exact: true })).toBeVisible();

    await projector.getByRole('button', { name: 'Enter full screen' }).click();
    await expect.poll(() => projector.evaluate(() => !!document.fullscreenElement)).toBeTruthy();
    await projector.getByRole('button', { name: 'Exit full screen' }).click();
    await projector.setViewportSize({ width: 390, height: 844 });
    await projector.screenshot({ path: testInfo.outputPath('projector-mobile.png'), fullPage: true });
    expect(await projector.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

    const publicResponse = await request.get(`${API}/api/public/tournaments/${tournament.slug}/auction-state`);
    expect(publicResponse.ok()).toBeTruthy();
    expect(await publicResponse.text()).not.toMatch(/drawPosition|eventData|userId|Private verification/i);
    const publicFrames = (await socketTelemetry()).messages;
    expect(publicFrames.length).toBeGreaterThan(0);
    expect(publicFrames.join('\n')).not.toMatch(/drawPosition|eventData|userId|Private verification/i);
    const deniedMutation = await request.post(`${API}/api${root}/auction/pause`);
    expect(deniedMutation.status()).toBe(401);

    // Check the visibility gate through both HTTP and the real SignalR transport.
    const privateTournament = await api('post', '/tournaments', { name: `Private Verification ${Date.now()}`, season: '2026' });
    const privateRoot = `/tournaments/${privateTournament.id}`;
    await api('put', `${privateRoot}/settings`, { currencyCode: 'INR', currencySymbol: '₹', defaultStartingPurse: 10000,
      minimumSquadSize: 1, maximumSquadSize: 4, minimumAcquisitionPrice: 500, defaultBidIncrement: 250, publicLiveViewEnabled: false });
    expect((await request.get(`${API}/api/public/tournaments/${privateTournament.slug}/auction-state`)).status()).toBe(404);
    const anonymousHub = new HubConnectionBuilder().withUrl(`${API}/hubs/auction`).configureLogging(LogLevel.None).build();
    await anonymousHub.start();
    try { await expect(anonymousHub.invoke('JoinAuction', privateTournament.id)).rejects.toThrow(/disabled/); }
    finally { await anonymousHub.stop(); }
    expect(errors).toEqual([]);
    console.log(`Verified tournament: ${tournament.id}`);
  } finally {
    await Promise.all([operatorContext.close(), secondOperatorContext.close(), publicContext.close()]);
  }
});
