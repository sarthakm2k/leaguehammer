import { test,expect,type Page } from 'playwright/test';
import type {AuctionResults,ResultPlayer} from '../src/features/auction/resultsTypes';
import type {AssignedTeamPlayer} from '../src/features/teams/teamPlayers';

const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#397e91"/><circle cx="50" cy="45" r="25" fill="#e2f0df"/></svg>');
function fixture(live=false):AuctionResults {
  const make=(id:string,name:string,status:string,team:string|null,role:string|null=null):ResultPlayer=>({playerId:id,playerName:name,photoUrl:photo,position:'Forward',age:24,preferredFoot:'Right',jerseyNumber:9,playerSetId:role?'leaders':'set',playerSetName:role?'Leadership':'Auction pool',basePrice:500,status,attemptCount:role?0:1,winningTeamId:status==='SOLD'?team:null,winningTeamName:status==='SOLD'?(team==='first'?'Falcons':'Warriors'):null,finalPrice:status==='SOLD'?500:null,pricePremium:status==='SOLD'?0:null,priceMultiplier:status==='SOLD'?1:null,assignedTeamId:role?team:null,assignedTeamName:role?(team==='first'?'Falcons':'Warriors'):null,assignedRole:role});
  const players=[make('captain','Captain Arjun','ASSIGNED','first','CAPTAIN'),make('icon','Icon Rohan','ASSIGNED','first','ICON'),make('captain-two','Captain Dev','ASSIGNED','second','CAPTAIN'),make('icon-two','Icon Manu','ASSIGNED','second','ICON'),make('sold','Auction Star','SOLD','first'),make('sold-two','Auction Gem','SOLD','second'),make('unsold','Remaining Player',live?'AVAILABLE':'FINAL_UNSOLD',null)];
  const standings=['first','second'].map(teamId=>({teamId,teamName:teamId==='first'?'Falcons':'Warriors',shortName:teamId==='first'?'FLC':'WAR',primaryColor:'#10b981',logoUrl:photo,initialPurse:3000,totalSpent:500,remainingPurse:2500,currentSquadSize:3,minimumSquadSize:3,maximumSquadSize:4,remainingSlotsToMinSquad:0,maxSlotsAvailable:1,requiredReserveForMinSquad:0,maximumAllowedBid:2500,canBid:true,assignedPlayers:players.filter(p=>p.assignedTeamId===teamId).map(p=>({playerId:p.playerId,playerName:p.playerName,photoUrl:p.photoUrl,position:p.position,role:p.assignedRole as AssignedTeamPlayer['role']}))}));
  const sold=players.filter(p=>p.status==='SOLD');
  return {state:{tournamentId:'cup',tournamentName:'Captain Cup',slug:'cup',currencyCode:'INR',currencySymbol:'₹',sessionStatus:live?'LIVE':'COMPLETED',version:1,isUnsoldRound:false,currentAttemptNumber:1,sellAllPlayers:false,currentLot:null,lastResult:null,totalPlayersCount:3,totalSoldPlayersCount:2,totalUnsoldPlayersCount:live?0:1,teamStandings:standings,soldPlayers:sold.map(p=>({...p,lotId:`lot-${p.playerId}`,attemptNumber:1,status:'SOLD'}))},players,publicLiveViewEnabled:true,tournamentLogoUrl:null,statistics:{totalPlayers:7,assignedPlayers:4,soldPlayers:2,unsoldPlayers:live?0:1,availablePlayers:live?1:0,salePercentage:66.67,totalSpent:1000,averageSalePrice:500,medianSalePrice:500,highestSalePrice:500,topPlayers:sold,biggestPricePremium:sold[0],highestPriceMultiplier:sold[0],mostExpensiveByPosition:[sold[0]],mostExpensiveBySet:[sold[0]],positions:[{position:'Forward',playerCount:2,totalSpent:1000}],sets:[{setId:'set',setName:'Auction pool',sortOrder:2,playerCount:3,soldCount:2,unsoldCount:1,totalSpent:1000,averageSalePrice:500,highestSalePrice:500,sellThroughPercentage:66.67}],teams:standings.map(standing=>({standing,averagePlayerCost:500,mostExpensiveSigning:sold.find(p=>p.winningTeamId===standing.teamId)!,positions:[{position:'Forward',playerCount:3,totalSpent:500}]})),biggestSpenderTeamId:'first',smallestSpenderTeamId:'second',largestRemainingPurseTeamId:'first',mostPlayersTeamId:'first',bestSellingSetId:'set'}};
}
async function sockets(page:Page){
  await page.route('**/hubs/auction/negotiate*',route=>route.fulfill({json:{negotiateVersion:1,connectionId:'test',connectionToken:'test',availableTransports:[{transport:'WebSockets',transferFormats:['Text','Binary']}]}}));
  await page.routeWebSocket('**/hubs/auction*',socket=>socket.onMessage(message=>{for(const part of String(message).split('\u001e').filter(Boolean)){const f=JSON.parse(part);if(f.protocol)socket.send('{}\u001e');if(f.type===1&&f.invocationId)socket.send(JSON.stringify({type:3,invocationId:f.invocationId})+'\u001e');}}));
}
async function publicView(page:Page,data=fixture()){
  await page.route('**/api/public/tournaments/cup/**',route=>route.fulfill({json:route.request().url().includes('auction-state')?data.state:data}));await sockets(page);return data;
}
async function setupTeams(page:Page,status='DRAFT'){
  const candidates=fixture().players.slice(0,3).map(p=>({playerId:p.playerId,playerName:p.playerName,photoUrl:p.photoUrl,position:p.position}));
  const team={id:'first',name:'Falcons',shortName:'FLC',initialPurse:3000,primaryColor:'#10b981',logoUrl:photo,assignedPlayers:[] as AssignedTeamPlayer[]};
  const state={team,writes:[] as {captainPlayerId:string|null;iconPlayerId:string|null}[],fail:false};
  await page.addInitScript(()=>localStorage.setItem('auth_token','test-token'));
  await page.route('**/api/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(path.endsWith('/assignments')){
      if(req.method()==='PUT'){const body=req.postDataJSON();state.writes.push(body);if(state.fail)return route.fulfill({status:409,json:{detail:'Players assigned to another team cannot be selected.'}});team.assignedPlayers=[];for(const [key,role]of [['captainPlayerId','CAPTAIN'],['iconPlayerId','ICON']] as const){if(body[key]){const player=candidates.find(p=>p.playerId===body[key])!;team.assignedPlayers.push({...player,role});}}}
      return route.fulfill({json:{assignedPlayers:team.assignedPlayers,availablePlayers:candidates}});
    }
    if(path.endsWith('/teams'))return route.fulfill({json:[team]});
    if(path.endsWith('/settings'))return route.fulfill({json:{publicLiveViewEnabled:true}});
    if(path.endsWith('/view-link'))return route.fulfill({json:{path:'/registrations/cup/view/token'}});
    return route.fulfill({json:{id:'cup',name:'Captain Cup',slug:'cup',season:'2026',status,userRole:'OWNER',createdAtUtc:'2026-11-20T00:00:00Z'}});
  });
  await page.goto('/tournaments/cup');await page.getByRole('button',{name:'Participating Teams',exact:true}).click();return state;
}
test('owners assign distinct captain and icon players on mobile and can release them',async({page})=>{
  await page.setViewportSize({width:390,height:844});const state=await setupTeams(page);
  await page.getByRole('button',{name:'Assign captain & icon'}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('combobox',{name:'Team captain',exact:true}).selectOption('captain');
  await expect(dialog.getByLabel('Team icon player').locator('option[value="captain"]')).toHaveAttribute('disabled', '');
  await dialog.getByLabel('Team icon player').selectOption('icon');
  await page.screenshot({path:'../.cache/team-assignment-mobile.png'});
  await dialog.getByRole('button',{name:'Save assignments'}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Captain and icon players'})).toContainText('Captain Arjun');
  await expect(page.getByRole('region',{name:'Captain and icon players'})).toContainText('Icon Rohan');
  expect(state.team.initialPurse).toBe(3000);expect(state.writes[0]).toEqual({captainPlayerId:'captain',iconPlayerId:'icon'});
  await page.getByRole('button',{name:'Assign captain & icon'}).click();await expect(dialog.getByRole('combobox',{name:'Team captain',exact:true})).toHaveValue('captain');
  await dialog.getByRole('combobox',{name:'Team captain',exact:true}).selectOption('');await dialog.getByLabel('Team icon player').selectOption('');
  await dialog.getByRole('button',{name:'Save assignments'}).click();await expect(dialog).toHaveCount(0);await expect(page.locator('.team-assigned-players')).toHaveCount(0);
  expect(state.writes[1]).toEqual({captainPlayerId:null,iconPlayerId:null});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('failed assignment preserves selection',async({page})=>{
  const state=await setupTeams(page);state.fail=true;await page.getByRole('button',{name:'Assign captain & icon'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'Team captain',exact:true}).selectOption('captain');await dialog.getByRole('button',{name:'Save assignments'}).click();
  await expect(dialog.getByRole('alert')).toContainText('another team');await expect(dialog.getByRole('combobox',{name:'Team captain',exact:true})).toHaveValue('captain');expect(state.team.assignedPlayers).toHaveLength(0);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
});

test('assignment controls are locked after draft',async({page})=>{
  await setupTeams(page,'READY');
  await expect(page.getByRole('heading',{name:'Falcons',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Assign captain & icon'})).toHaveCount(0);
});
test('public team squads include both free roles while the target pool excludes them',async({page})=>{
  await publicView(page,fixture(true));await page.setViewportSize({width:390,height:844});await page.goto('/live/cup/teams/first');
  await expect(page.locator('.team-assigned-players')).toContainText('Captain Arjun');await expect(page.getByTestId('franchise-purse')).toHaveText('₹2,500');
  await page.getByRole('button',{name:'Squad (3)',exact:true}).click();
  await expect(page.getByTestId('franchise-signing-captain')).toContainText('Captain · Preassigned');await expect(page.getByTestId('franchise-signing-icon')).toContainText('Icon player · Preassigned');
  await expect(page.locator('.franchise-roster-grid article')).toHaveCount(3);
  await page.getByRole('button',{name:'Plan & targets',exact:true}).click();await expect(page.getByTestId('team-target-unsold')).toBeVisible();await expect(page.getByTestId('team-target-captain')).toHaveCount(0);
  await page.screenshot({path:'../.cache/team-squad-captain-mobile.png'});
});
test('result summaries distinguish preassigned members from auction sales',async({page})=>{
  await publicView(page);await page.goto('/live/cup?view=results');
  await expect(page.getByRole('heading',{name:'Captain and icon players',exact:true})).toBeVisible();
  const captain=page.getByTestId('result-player-captain');await expect(captain).toContainText('Captain');await expect(captain).toContainText('Preassigned');await expect(captain).toContainText('Not auctioned');await expect(captain).toContainText('Falcons');
  await page.getByRole('combobox',{name:'Player status'}).selectOption('ASSIGNED');await expect(page.locator('[data-testid^="result-player-"]')).toHaveCount(4);
});
test('recap includes captains and icons in squads and excludes them from unsold filters',async({page})=>{
  await publicView(page);await page.goto('/live/cup/recap');
  const captain=page.getByTestId('recap-player-captain');await expect(captain).toContainText('Captain · Preassigned');await expect(captain).toContainText('No purse deduction');
  await page.getByLabel('Filter recap by team').selectOption('first');await expect(page.locator('.recap-player-grid article')).toHaveCount(3);
  await page.getByLabel('Filter recap by team').selectOption('UNSOLD');await expect(page.locator('.recap-player-grid article')).toHaveCount(1);await expect(page.getByTestId('recap-player-unsold')).toBeVisible();
});
test('Wrapped squad and personal slides export preassigned roles without fake sale prices',async({page})=>{
  await page.addInitScript(()=>{const original=CanvasRenderingContext2D.prototype.fillText;const captured:string[]=[];(window as unknown as {drawnTexts:string[]}).drawnTexts=captured;CanvasRenderingContext2D.prototype.fillText=function(...args:Parameters<typeof original>){captured.push(args[0]);return original.apply(this,args);};});
  await publicView(page);await page.setViewportSize({width:390,height:844});await page.goto('/live/cup/wrapped?slide=team-cards-first-1');
  await expect(page.locator('.wrapped-squad-card')).toHaveCount(3);await expect(page.getByTestId('wrapped-squad-card-captain')).toContainText('Captain');await expect(page.getByTestId('wrapped-squad-card-icon')).toContainText('Icon player');
  const squadDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Download final squad poster'}).click();expect(await(await squadDownload).failure()).toBeNull();
  await page.getByTestId('wrapped-squad-card-captain').click();await expect(page.locator('.signing-announcement h2')).toHaveText('CAPTAIN.');await expect(page.locator('.signing-contract')).toContainText('Squad role');await expect(page.locator('.signing-poster')).toContainText('No purse deduction');
  await page.screenshot({path:'../.cache/wrapped-captain-mobile.png'});
  await page.evaluate(()=>(window as unknown as {drawnTexts:string[]}).drawnTexts.length=0);
  const image=page.waitForEvent('download');await page.getByRole('button',{name:'Download player image'}).click();expect(await(await image).failure()).toBeNull();
  const text=await page.evaluate(()=>(window as unknown as {drawnTexts:string[]}).drawnTexts);expect(text).toContain('CAPTAIN.');expect(text).toContain('SQUAD ROLE');expect(text).not.toContain('SIGNED FOR');expect(text).not.toContain('₹0');
  for(const role of ['captain','icon']){
    await page.goto(`/live/cup/wrapped?slide=signing-${role}`);
    await expect(page.locator('.signing-poster')).toHaveAttribute('data-preassigned','true');
    await expect.poll(()=>page.locator('.signing-poster').evaluate(el=>getComputedStyle(el.closest('.wrapped-slide')!).opacity)).toBe('1');
    const fits=await page.locator('.signing-announcement h2').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect().right<=el.closest('.signing-poster')!.getBoundingClientRect().right;});
    expect(fits).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`../.cache/wrapped-${role}-mobile.png`});
  }
});
test('projector rosters show assigned leaders without changing auction progress totals',async({page})=>{
  await publicView(page,fixture(true));await page.goto('/live/cup/projector');
  const roster=page.getByRole('group',{name:'Selected team roster'});await expect(roster).toContainText('3 in squad');await expect(roster).toContainText('Captain Arjun');await expect(roster).toContainText('Icon Rohan');await expect(roster).toContainText('Preassigned');
});
