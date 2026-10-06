import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';
import type { AuctionResults, ResultPlayer } from '../src/features/auction/resultsTypes';

const teamId = '11111111-1111-1111-1111-111111111111';
const badge = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="lime" d="M10 10h80v60L50 95 10 70z"/></svg>');
function storyData(): AuctionResults {
  const players: ResultPlayer[] = Array.from({ length:15 }, (_,i) => ({ playerId:`p-${i}`, playerName:`Player ${String(i+1).padStart(2,'0')}`, photoUrl:badge, position:i%2 ? 'Forward':'Defender', age:22, preferredFoot:'Right', jerseyNumber:null,
    playerSetId:'set-a', playerSetName:'First Set', basePrice:500, status:i<13 ? 'SOLD':'FINAL_UNSOLD', attemptCount:i===0 ? 2:1,
    winningTeamId:i<13 ? teamId:null, winningTeamName:i<13 ? 'Falcons FC':null, finalPrice:i<13 ? 3000-i*100:null, pricePremium:i<13 ? 2500-i*100:null, priceMultiplier:i<13 ? (3000-i*100)/500:null }));
  const spent=players.reduce((total,p)=>total+(p.finalPrice??0),0);
  const standing={ teamId, teamName:'Falcons FC', shortName:'FLC', primaryColor:'#10B981', logoUrl:badge, initialPurse:50000, totalSpent:spent, remainingPurse:50000-spent,
    currentSquadSize:13, minimumSquadSize:11, maximumSquadSize:15, remainingSlotsToMinSquad:0, maxSlotsAvailable:2, requiredReserveForMinSquad:0, maximumAllowedBid:0, canBid:false };
  const empty={ ...standing, teamId:'empty', teamName:'Warriors FC', shortName:'WAR', currentSquadSize:0, totalSpent:0, remainingPurse:50000 };
  return { publicLiveViewEnabled:true, tournamentLogoUrl:null, players,
    state:{ tournamentId:'22222222-2222-2222-2222-222222222222', tournamentName:'Champions Trophy 2026', slug:'demo', currencyCode:'INR', currencySymbol:'₹', sessionStatus:'COMPLETED', version:1, sellAllPlayers:false, currentAttemptNumber:2, isUnsoldRound:true, currentLot:null, lastResult:null, totalPlayersCount:15, totalSoldPlayersCount:13, totalUnsoldPlayersCount:2, teamStandings:[standing,empty], soldPlayers:[] },
    statistics:{ totalPlayers:15, soldPlayers:13, unsoldPlayers:2, availablePlayers:0, salePercentage:13/15*100, totalSpent:spent, averageSalePrice:spent/13, medianSalePrice:2400, highestSalePrice:3000,
      topPlayers:players.slice(0,10), biggestPricePremium:players[0], highestPriceMultiplier:players[0], mostExpensiveByPosition:[players[0],players[1]], mostExpensiveBySet:[players[0]],
      teams:[{ standing, averagePlayerCost:spent/13, mostExpensiveSigning:players[0], positions:[{ position:'Forward',playerCount:6,totalSpent:14400 }] },{ standing:empty,averagePlayerCost:0,mostExpensiveSigning:null,positions:[] }],
      sets:[{ setId:'set-a',setName:'First Set',sortOrder:0,playerCount:15,soldCount:13,unsoldCount:2,totalSpent:spent,averageSalePrice:spent/13,highestSalePrice:3000,sellThroughPercentage:13/15*100 }],
      positions:[{ position:'Forward',playerCount:6,totalSpent:14400 },{ position:'Defender',playerCount:7,totalSpent:spent-14400 }], biggestSpenderTeamId:teamId,smallestSpenderTeamId:'empty',largestRemainingPurseTeamId:'empty',mostPlayersTeamId:teamId,bestSellingSetId:'set-a' } };
}
async function mock(page:Page,data:AuctionResults) { await page.route('**/api/public/tournaments/demo/results',route=>route.fulfill({json:data})); }
test('mobile Wrapped covers all squads, stories, swipe, keyboard, deep links and sharing', async ({ page,context }) => {
  const data=storyData(); await mock(page,data); await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.setViewportSize({width:390,height:844}); await page.goto('/live/demo/wrapped');
  await expect(page).toHaveTitle('Champions Trophy 2026 Auction Wrapped');
  await expect(page.getByRole('heading',{level:1})).toContainText('AUCTION');
  await expect(page.getByRole('button',{name:'Previous slide'})).toBeDisabled();
  await page.getByRole('button',{name:'Next slide'}).click();
  await expect(page.getByTestId('wrapped-slide')).toContainText('Total invested');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('wrapped-slide')).toContainText('Player 01');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('wrapped-slide')).toContainText('Total invested');
  await page.getByTestId('wrapped-slide').evaluate(node => {
    node.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[new Touch({identifier:1,target:node,clientX:280,clientY:300})]}));
    node.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[new Touch({identifier:1,target:node,clientX:80,clientY:310})]}));
  });
  await expect(page.getByTestId('wrapped-slide')).toContainText('The record signing');
  const options=await page.getByRole('combobox',{name:'Jump to story slide'}).locator('option').evaluateAll(nodes=>nodes.map(n=>(n as HTMLOptionElement).value));
  const teamSlides=options.filter(id=>id.startsWith(`team-${teamId}-`)); expect(teamSlides).toHaveLength(5);
  const signed:string[]=[];
  for(const id of teamSlides) { await page.getByRole('combobox').selectOption(id); signed.push(...await page.locator('[data-testid^="wrapped-player-"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')!))); }
  expect(signed).toEqual(data.players.filter(p=>p.status==='SOLD').map(p=>`wrapped-player-${p.playerId}`));
  await page.getByRole('combobox').selectOption(teamSlides[2]);
  await page.getByRole('button',{name:'Copy this slide'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(new URL(`/live/demo/wrapped?slide=${teamSlides[2]}`,page.url()).href);
  await page.reload(); await expect(page.getByTestId('wrapped-slide')).toContainText('Player 07');
  for(const size of [{width:390,height:844},{width:320,height:568},{width:1280,height:800}]) {
    await page.setViewportSize(size);
    for(const id of options) {
      await page.getByRole('combobox').selectOption(id);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(await page.getByTestId('wrapped-slide').evaluate(node=>node.scrollHeight<=node.clientHeight+1),`Slide ${id} overflows at ${size.width}×${size.height}`).toBe(true);
    }
  }
  await page.setViewportSize({width:390,height:844}); await page.getByRole('combobox').selectOption('intro');
  await expect(page.getByTestId('wrapped-slide')).toHaveCSS('opacity','1');
  await page.screenshot({path:'../.cache/wrapped-intro-mobile.png'});
  await page.getByRole('combobox').selectOption(teamSlides[0]); await expect(page.getByTestId('wrapped-slide')).toHaveCSS('opacity','1'); await page.screenshot({path:'../.cache/wrapped-team-mobile.png'});
  await page.evaluate(()=>document.documentElement.dataset.theme='light'); await expect(page.locator('.wrapped-frame')).toHaveCSS('background-color','rgb(233, 238, 239)');
});
test('Wrapped links appear after completion; public access and empty auctions are handled',async({page})=>{
  const data=storyData(); await mock(page,data); await page.goto('/live/demo/recap');
  await expect(page.getByRole('link',{name:'Watch Auction Wrapped'})).toHaveAttribute('href','/live/demo/wrapped');
  data.state.sessionStatus='LIVE'; await page.goto('/live/demo/wrapped'); await expect(page.getByRole('heading',{name:'The story is still unfolding.'})).toBeVisible();
  data.state.sessionStatus='COMPLETED'; data.players=[]; data.statistics.teams=[]; data.statistics.positions=[]; data.statistics.highestPriceMultiplier=null;
  data.statistics.totalPlayers=0; data.statistics.soldPlayers=0; data.statistics.unsoldPlayers=0; data.statistics.salePercentage=0; data.statistics.totalSpent=0;
  await page.reload(); await expect(page.getByRole('heading',{level:1})).toBeVisible();
  await page.getByRole('combobox').selectOption('finale'); await expect(page.getByTestId('wrapped-slide')).toContainText('On the pitch.');
  await page.route('**/api/public/tournaments/demo/results',route=>route.fulfill({status:404,json:{detail:'Public live view is disabled.'}}));
  await page.reload(); await expect(page.getByRole('heading',{name:'Wrapped unavailable'})).toBeVisible();
});
