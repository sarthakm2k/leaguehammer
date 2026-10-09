import { test, expect, type Page } from 'playwright/test';
function fixture(count: number) {
  const teamStandings = Array.from({ length: count }, (_, index) => ({ teamId: `team-${index}`, teamName: `Franchise ${index + 1}`, shortName: `FC${index + 1}`, primaryColor: '#b7ef59', initialPurse: 100000, remainingPurse: 85000, totalSpent: 15000, currentSquadSize: 3, minimumSquadSize: 8, maximumSquadSize: 12, maximumAllowedBid: 80000, canBid: true }));
  const currentLot = { lotId: 'lot', sessionId: 'session', playerId: 'player', playerName: 'Arjun Menon', photoUrl: null, position: 'Forward', cardPosition: 'ST', age: 24, preferredFoot: 'Right', basePrice: 500, currentBid: 1500, leadingTeamId: 'team-0', drawPosition: 1, playerSetName: 'Elite Forwards', attemptNumber: 1, status: 'ON_AUCTION', ratings: { overall: 91, isGoalkeeper: false, attributes: { pace: 96, shooting: 96, passing: 80, dribbling: 88, defending: 60, physical: 94 } } };
  return { tournamentId: 'screen-cup', tournamentName: 'Malabar Champions Trophy 2026', slug: 'screen-cup', sessionStatus: 'LIVE', version: 1, currencyCode: 'INR', currencySymbol: '₹', defaultBidIncrement: 100, sellAllPlayers: true, currentSetName: 'Elite Forwards', currentSetId: 'set', currentLot, lastResult: null, totalSpentAcrossTournament: 180000, totalPlayersCount: 96, totalSoldPlayersCount: 30, totalUnsoldPlayersCount: 2, teamStandings, soldPlayers: [], completedSetIds: [] };
}


async function recoverySetup(page: Page) {
  const state=fixture(2);let fail=false;let gate: Promise<void> | null=null;let release=()=>{};let notify=()=>{};let joins=0;let writes=0;
  await page.addInitScript(()=>localStorage.setItem('auth_token','test-token'));
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(route.request().method()==='POST'){writes++;return route.fulfill({json:state});}
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(path.endsWith('/player-sets'))return route.fulfill({json:[]});
    if(path.endsWith('/screen-cup'))return route.fulfill({json:{userRole:'OWNER'}});
    if(gate)await gate;
    if(fail)return route.fulfill({status:503,json:{detail:'Temporarily unavailable'}});
    return route.fulfill({json:state});
  });
  await page.route('**/hubs/auction/negotiate*',route=>route.fulfill({json:{negotiateVersion:1,connectionId:'test',connectionToken:'test',availableTransports:[{transport:'WebSockets',transferFormats:['Text','Binary']}]}}));
  await page.routeWebSocket('**/hubs/auction*',socket=>{
    socket.onMessage(message=>{
      for(const part of String(message).split('\u001e').filter(Boolean)){
        const frame=JSON.parse(part);
        if(frame.protocol)socket.send('{}\u001e');
        if(frame.type===1&&frame.invocationId){joins++;socket.send(JSON.stringify({type:3,invocationId:frame.invocationId})+'\u001e');}
      }
    });
    notify=()=>socket.send(JSON.stringify({type:1,target:'AuctionStateChanged',arguments:['LIVE']})+'\u001e');
  });
  await page.goto('/tournaments/screen-cup/auction');await expect(page.getByText('Live connection',{exact:true})).toBeVisible();
  return {state,notify:()=>notify(),fail:(value:boolean)=>{fail=value;},hold:()=>{gate=new Promise<void>(resolve=>{release=resolve;});},release:()=>{gate=null;release();},writes:()=>writes,joins:()=>joins};
}

test('offline console blocks clicks and hotkeys, then waits for fresh state before unlocking',async({page,context})=>{
  await page.setViewportSize({width:1280,height:588});const controls=await recoverySetup(page);
  const price=page.getByRole('spinbutton',{name:'Winning bid price'});
  const lastSync=page.getByTestId('auction-last-sync');await expect(lastSync.locator('time')).toHaveAttribute('datetime',/.+/);
  const before=await lastSync.locator('time').getAttribute('datetime');await price.fill('9999');
  await context.setOffline(true);await expect(page.getByTestId('auction-recovery')).toBeVisible();
  await expect(page.getByRole('button',{name:'Update Live Bid'})).toBeDisabled();await expect(page.getByRole('button',{name:/SOLD TO FC1/})).toBeDisabled();await expect(page.getByRole('button',{name:/MARK UNSOLD/})).toBeDisabled();await expect(price).toBeDisabled();
  await page.keyboard.press('Enter');await page.keyboard.press('u');expect(controls.writes()).toBe(0);
  expect(await lastSync.locator('time').getAttribute('datetime')).toBe(before);
  controls.state.currentLot.currentBid=2500;controls.hold();const joinsBefore=controls.joins();
  await context.setOffline(false);await expect.poll(controls.joins).toBeGreaterThan(joinsBefore);
  await expect(page.getByText(/Syncing auction/)).toBeVisible();await expect(price).toBeDisabled();expect(await lastSync.locator('time').getAttribute('datetime')).toBe(before);
  controls.release();await expect(page.getByText('Live connection',{exact:true})).toBeVisible();await expect(price).toHaveValue('2500');await expect(price).toBeEnabled();await expect(page.getByTestId('auction-recovery')).toHaveCount(0);
  await expect.poll(()=>lastSync.locator('time').getAttribute('datetime')).not.toBe(before);expect(controls.writes()).toBe(0);
  await page.screenshot({path:'../testscreenshots/auction-recovered.png'});
});

test('state refresh failures keep actions blocked and the last confirmation unchanged until retry succeeds',async({page})=>{
  const controls=await recoverySetup(page),lastSync=page.getByTestId('auction-last-sync');const before=await lastSync.locator('time').getAttribute('datetime');
  controls.fail(true);controls.notify();await expect(page.getByTestId('auction-recovery')).toBeVisible();
  await expect(page.getByRole('button',{name:'Update Live Bid'})).toBeDisabled();expect(await lastSync.locator('time').getAttribute('datetime')).toBe(before);
  controls.state.currentLot.currentBid=3500;controls.fail(false);
  await expect(page.getByText('Live connection',{exact:true})).toBeVisible({timeout:15000});await expect(page.getByRole('spinbutton',{name:'Winning bid price'})).toHaveValue('3500');await expect(page.getByRole('button',{name:'Update Live Bid'})).toBeEnabled();expect(controls.writes()).toBe(0);
});
