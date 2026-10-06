import { test, expect, type Page } from 'playwright/test';

function fixture() {
  const lot={lotId:'lot-one',playerId:'player-one',playerName:'First Signing',position:'Forward',photoUrl:null,playerSetName:'Forwards',playerSetId:'set-one',attemptNumber:1,status:'ON_AUCTION',basePrice:500,currentBid:null as number|null,leadingTeamId:null as string|null};
  const state={tournamentId:'reveal-cup',tournamentName:'Reveal Cup',slug:'reveal',sessionStatus:'LIVE',version:1,currencyCode:'INR',currencySymbol:'₹',currentLot:lot as typeof lot|null,lastResult:null as typeof lot|null,teamStandings:[],soldPlayers:[],totalPlayersCount:8,totalSoldPlayersCount:0,totalUnsoldPlayersCount:0,currentSetName:'Forwards',isUnsoldRound:false};
  const results={state,players:[],publicLiveViewEnabled:true,tournamentLogoUrl:null,statistics:{teams:[],sets:[],positions:[],topPlayers:[],totalPlayers:8,soldPlayers:0,unsoldPlayers:0,availablePlayers:8,salePercentage:0,totalSpent:0,averageSalePrice:0,medianSalePrice:0,highestSalePrice:0,mostExpensiveByPosition:[],mostExpensiveBySet:[]}};
  return {state,results,lot};
}

async function connect(page:Page,data:ReturnType<typeof fixture>,path:string) {
  await page.route('**/api/public/tournaments/**',route=>route.fulfill({json:route.request().url().includes('auction-state') ? data.state : data.results}));
  await page.route('**/hubs/auction/negotiate*',route=>route.fulfill({json:{negotiateVersion:1,connectionId:'test',connectionToken:'test',availableTransports:[{transport:'WebSockets',transferFormats:['Text','Binary']}]}}));
  let emit=(_event:string,_args:unknown[])=>{};
  await page.routeWebSocket('**/hubs/auction*',socket=>{
    socket.onMessage(message=>{
      for(const part of String(message).split('\u001e').filter(Boolean)) {
        const frame=JSON.parse(part);
        if(frame.protocol) socket.send('{}\u001e');
        if(frame.type===1 && frame.invocationId) socket.send(JSON.stringify({type:3,invocationId:frame.invocationId})+'\u001e');
      }
    });
    emit=(event,args)=>{
      socket.send(JSON.stringify({type:1,target:event,arguments:args})+'\u001e');
      socket.send(JSON.stringify({type:1,target:'AuctionStateChanged',arguments:['LIVE']})+'\u001e');
    };
  });
  await page.goto(path); await expect(page.getByText('Live connection',{exact:true})).toBeVisible();
  return (event:string,args:unknown[])=>emit(event,args);
}

test('four-second live reveals conceal identities, do not replay, and yield to auction actions',async({browser})=>{
  const context=await browser.newContext(); const stage=await context.newPage(); const live=await context.newPage();
  const data=fixture(); const pages=[stage,live];
  try {
    const events=await Promise.all([connect(stage,data,'/live/reveal/projector'),connect(live,data,'/live/reveal')]);
    for(const page of pages) {
      await expect(page.getByRole('article',{name:'First Signing player card'})).toBeVisible();
      await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
    }
    // Playwright's clock is shared by all pages in this browser context.
    await stage.clock.install(); await stage.clock.pauseAt(new Date(Date.now()+100));
    const notify=(event:string,args:unknown[])=>events.forEach(send=>send(event,args));
    const next=(id:string,name:string)=>{
      data.state.currentLot={...data.lot,lotId:id,playerId:id,playerName:name}; data.state.lastResult=null; data.state.version++;
      notify('PlayerRevealed',[data.state.currentLot]);
    };
    next('lot-two','Surprise Signing');
    for(const page of pages) {
      await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
      await expect(page.locator('.auction-card-spinner')).toHaveCSS('animation-duration','4s');
      await expect(page.getByRole('article',{name:'Surprise Signing player card'})).toHaveCount(0);
    }
    await expect(stage.getByTestId('stage-player')).toHaveCount(0);
    await expect(live.getByTestId('portal-current-player')).toHaveCount(0);
    await stage.clock.runFor(3500);
    for(const page of pages) await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
    notify('PlayerRevealed',[data.state.currentLot]); // Duplicate event must not restart the timer.
    await stage.clock.runFor(600);
    for(const page of pages) {
      await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
      await expect(page.getByRole('article',{name:'Surprise Signing player card'})).toBeVisible();
    }
    next('lot-three','Opening Bid Signing');
    for(const page of pages) await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
    data.state.currentLot!.currentBid=750; notify('BidUpdated',[750,null]);
    for(const page of pages) {
      await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
      await expect(page.getByRole('article',{name:'Opening Bid Signing player card'})).toBeVisible();
    }
    for(const status of ['SOLD','UNSOLD']) {
      next(`lot-${status}`,`${status} Signing`);
      for(const page of pages) await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
      data.state.lastResult={...data.state.currentLot!,status}; data.state.currentLot=null;
      notify(status==='SOLD' ? 'PlayerSold' : 'PlayerUnsold',[data.state.lastResult]);
      for(const page of pages) {
        await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
        await expect(page.getByRole('article',{name:`${status} Signing player card`})).toBeVisible();
      }
    }
    next('lot-older','Older Signing');
    for(const page of pages) await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
    next('lot-latest','Latest Signing');
    for(const page of pages) await expect(page.getByTestId('auction-player-reveal')).toHaveAttribute('data-lot-id','lot-latest');
    await stage.clock.runFor(4100);
    for(const page of pages) await expect(page.getByRole('article',{name:'Latest Signing player card'})).toBeVisible();
    await stage.clock.resume();
    // A reload gets the current state directly, without a live reveal event.
    await live.reload(); await expect(live.getByText('Live connection',{exact:true})).toBeVisible();
    await expect(live.getByTestId('auction-player-reveal')).toHaveCount(0);
    await expect(live.getByRole('article',{name:'Latest Signing player card'})).toBeVisible();
    await stage.evaluate(()=>window.dispatchEvent(new Event('offline')));
    await expect(stage.getByText('Connection lost · Reconnecting…',{exact:true})).toBeVisible();
    await stage.evaluate(()=>window.dispatchEvent(new Event('online')));
    await expect(stage.getByText('Live connection',{exact:true})).toBeVisible();
    await expect(stage.getByTestId('auction-player-reveal')).toHaveCount(0);
  } finally {await context.close();}
});

test('a mobile reveal animates and finishes after four real seconds',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const data=fixture(); const emit=await connect(page,data,'/live/reveal/projector');
  data.state.currentLot={...data.lot,lotId:'real-time-reveal',playerName:'New Star Signing'};
  emit('PlayerRevealed',[data.state.currentLot]);
  await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
  const started=Date.now();
  const spinner=page.locator('.auction-card-spinner');
  const transform=await spinner.evaluate(node=>getComputedStyle(node).transform);
  await expect.poll(()=>spinner.evaluate(node=>getComputedStyle(node).transform)).not.toBe(transform);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'../.cache/player-pack-reveal-mobile.png',animations:'disabled'});
  await expect(page.getByRole('article',{name:'New Star Signing player card'})).toBeVisible({timeout:6000});
  expect(Date.now()-started).toBeGreaterThan(3500);
  expect(Date.now()-started).toBeLessThan(6500);
});

test('reduced motion skips the pack opening and a preference change interrupts it',async({page})=>{
  const data=fixture(); await page.emulateMedia({reducedMotion:'reduce'});
  const emit=await connect(page,data,'/live/reveal/projector');
  data.state.currentLot={...data.lot,lotId:'reduced',playerName:'Reduced Motion Signing'};
  emit('PlayerRevealed',[data.state.currentLot]);
  await expect(page.getByRole('article',{name:'Reduced Motion Signing player card'})).toBeVisible();
  await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  data.state.currentLot={...data.lot,lotId:'animated',playerName:'Animated Signing'};
  emit('PlayerRevealed',[data.state.currentLot]);
  await expect(page.getByTestId('auction-player-reveal')).toBeVisible();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.getByRole('article',{name:'Animated Signing player card'})).toBeVisible();
  await expect(page.getByTestId('auction-player-reveal')).toHaveCount(0);
});
