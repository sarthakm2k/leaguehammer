import { test, expect, type Page } from 'playwright/test';

const token = 'a'.repeat(64), path = `/registrations/cup/view/${token}`;
const picture = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#447a89"/><circle cx="50" cy="44" r="20" fill="#c1dce1"/><path d="M15 140V105a35 35 0 0 1 70 0v35" fill="#c1dce1"/></svg>';
function fixture(count=3) {
  return {tournamentName:'Organizer Cup',timeZone:'Asia/Kolkata',updatedAtUtc:'2026-11-18T08:00:00Z',players:Array.from({length:count},(_,i) => ({id:`player-${i}`,name:`Player ${String(i+1).padStart(2,'0')}`,age:21+i%10,position:i%2 ? 'Defender':'Forward',preferredFoot:'Right',status:['PENDING','APPROVED','REJECTED'][i%3],submittedAtUtc:'2026-11-18T07:00:00Z',hasPhoto:i!==1}))};
}
async function shared(page:Page,data:ReturnType<typeof fixture>) {
  const state={data,status:200,reads:0,methods:[] as string[],brokenPhoto:false};
  await page.route('**/api/registration/cup/view/**',route=>{
    state.methods.push(route.request().method());
    if(route.request().url().endsWith('/photo')) return state.brokenPhoto ? route.fulfill({status:404}) : route.fulfill({contentType:'image/svg+xml',body:picture});
    state.reads++;
    return route.fulfill({status:state.status,json:state.status===200 ? state.data : {detail:'Viewing link unavailable'}});
  });
  return state;
}
async function owner(page:Page,role='OWNER') {
  let requests=0;
  await page.addInitScript(()=>localStorage.setItem('auth_token','owner-auth-token'));
  await page.route('**/api/**',route=>{
    const url=new URL(route.request().url()).pathname;
    if(url.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(url.endsWith('/view-link')){requests++;expect(route.request().headers().authorization).toBe('Bearer owner-auth-token');return route.fulfill({json:{path}});}
    if(url.endsWith('/teams'))return route.fulfill({json:[]});
    if(url.endsWith('/settings'))return route.fulfill({json:{publicLiveViewEnabled:false}});
    return route.fulfill({json:{id:'cup',name:'Organizer Cup',slug:'cup',status:'DRAFT',userRole:role,season:'2026',timeZone:'Asia/Kolkata',createdAtUtc:'2026-11-01T00:00:00Z'}});
  });
  return ()=>requests;
}
test('overview shares a separate viewing link that works without organizer sign-in',async({page,context,browser})=>{
  await context.grantPermissions(['clipboard-read','clipboard-write']);await owner(page);await page.goto('/tournaments/cup');
  const url=new URL(path,page.url()).href;
  await expect(page.getByLabel('Registered players sharing link')).toHaveValue(url);
  await expect(page.getByRole('link',{name:'Open registered players list'})).toHaveAttribute('href',path);
  await page.getByRole('button',{name:'Copy registered players link'}).click();
  expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(url);
  expect(url).not.toContain('owner-auth-token');
  const guest=await browser.newContext();
  try {
    const viewer=await guest.newPage(),state=await shared(viewer,fixture());await viewer.goto(url);
    await expect(viewer.getByRole('heading',{name:'Organizer Cup'})).toBeVisible();
    await expect(viewer.getByRole('region',{name:'Registered players'}).locator('article')).toHaveCount(3);
    await expect(viewer.getByRole('heading',{name:'Player 01'})).toBeVisible();
    await expect(viewer.getByRole('img',{name:'Player 01',exact:true})).toBeVisible();
    await expect(viewer.getByRole('img',{name:'Player 02 avatar'})).toBeVisible();
    for(const name of ['Approve & add player','Reject submission','Review submission','Edit player']) await expect(viewer.getByRole('button',{name,exact:true})).toHaveCount(0);
    await expect(viewer.getByText('VIEW ONLY',{exact:true})).toBeVisible();
    expect(await viewer.evaluate(()=>localStorage.getItem('auth_token'))).toBeNull();
    expect(state.methods.every(method=>method==='GET')).toBe(true);
  } finally {await guest.close();}
});
test('mobile list filters and paginates, loading updates only after manual refresh',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.clock.install();
  const data=fixture(26),state=await shared(page,data);await page.goto(path);
  const list=page.getByRole('region',{name:'Registered players'});
  await expect(list.locator('article')).toHaveCount(24);
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(list.locator('article')).toHaveCount(2);
  await page.getByLabel('Search players').fill('Player 25');await expect(list.locator('article')).toHaveCount(1);
  await expect(page.getByRole('heading',{name:'Player 25'})).toBeVisible();
  await page.getByLabel('Search players').fill('');await page.getByLabel('Registration status').selectOption('APPROVED');
  await expect(list.locator('article')).toHaveCount(9);
  await page.getByLabel('Search players').fill('No matching name');await expect(page.getByText('No players match your search or status filter.')).toBeVisible();
  await page.getByLabel('Search players').fill('');await page.getByLabel('Registration status').selectOption('');
  state.data.players.push({...data.players[0],id:'new-player',name:'New Arrival'});
  const reads=state.reads;await page.clock.fastForward(120000);
  await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));});
  await page.clock.runFor(1000);
  expect(state.reads).toBe(reads);await expect(page.getByRole('status')).toHaveText('26 players registered');
  await page.getByRole('button',{name:'Refresh list',exact:true}).click();await expect.poll(()=>state.reads).toBe(reads+1);
  await expect(page.getByRole('status')).toHaveText('27 players registered');
  for(const width of [390,320,600]){
    await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const row=await list.locator('article').first().boundingBox(),photo=await list.locator('.registration-viewer-photo').first().boundingBox();
    const name=await list.getByRole('heading').first().boundingBox();
    expect(name!.x).toBeGreaterThanOrEqual(photo!.x+photo!.width);
    expect(row!.height).toBeLessThan(180);
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'../.cache/registration-viewer-mobile.png'});
  await page.getByRole('button',{name:'Switch to light mode'}).click();await expect(page.locator('.registration-viewer-player').first()).toHaveCSS('background-color','rgb(255, 255, 255)');
  await page.screenshot({path:'../.cache/registration-viewer-light.png'});
  const beforeReload=state.reads;await page.reload();await expect.poll(()=>state.reads).toBeGreaterThan(beforeReload);
  await expect(page.getByRole('status')).toHaveText('27 players registered');
});
test('unavailable links expose no player list and do not redirect to admin sign-in',async({page})=>{
  const state=await shared(page,fixture());state.status=404;await page.goto(path);
  await expect(page.getByRole('alert')).toContainText('This viewing link is unavailable');
  await expect(page.getByRole('region',{name:'Registered players'})).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/registrations/cup/view/${token}$`));
});
test('empty registration list and unavailable photos have clear fallbacks',async({page})=>{
  const state=await shared(page,fixture(0));await page.goto(path);
  await expect(page.getByText('No players have registered yet.',{exact:false})).toBeVisible();
  state.data=fixture();state.brokenPhoto=true;await page.getByRole('button',{name:'Refresh list',exact:true}).click();
  await expect(page.getByRole('img',{name:'Player 01 avatar'})).toBeVisible();
});
test('tournament viewers cannot obtain a registration sharing link from the overview',async({page})=>{
  const requests=await owner(page,'VIEWER');await page.goto('/tournaments/cup');
  await expect(page.getByRole('heading',{name:'Tournament links'})).toBeVisible();
  await expect(page.getByLabel('Registered players sharing link')).toHaveCount(0);expect(requests()).toBe(0);
});
