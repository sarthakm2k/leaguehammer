import { test, expect, type Page } from 'playwright/test';

const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lime"/></svg>');
const player = { id:'player',name:'Arjun Menon',playerSetId:'set',playerSetName:'Forwards',status:'AVAILABLE',basePrice:500,position:'Forward',photoUrl:photo,age:24,preferredFoot:'Right',jerseyNumber:9,previousTeam:'Falcons',shortBio:'Local forward',cardPosition:'ST',ratings:{overall:91,attributes:{pace:96}} };
const registration = { ...player,id:'entry',phone:'+919876543210',email:null,hasPhoto:false,status:'PENDING',submittedAtUtc:'2026-11-01T00:00:00Z',possibleDuplicate:false };
function form() {
  return { tournamentId:'cup',tournamentName:'Profile Cup',slug:'cup',timeZone:'Asia/Kolkata',enabled:true,closedManually:false,finalizedAtUtc:null,instructions:null,status:'OPEN',serverTimeUtc:new Date().toISOString(),opensAtUtc:new Date(Date.now()-60000).toISOString(),closesAtUtc:new Date(Date.now()+3600000).toISOString(),photoUploadAvailable:true };
}
async function setup(page:Page) {
  const writes: Record<string,unknown>[] = [];
  await page.addInitScript(() => localStorage.setItem('auth_token','test-token'));
  await page.route('**/api/**',route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if (path.endsWith('/review') || (request.method() !== 'GET' && path.includes('/players'))) {
      writes.push(request.postDataJSON()); return route.fulfill({json:player});
    }
    if (path.includes('/registration/') || path.endsWith('/registrations/settings')) return route.fulfill({json:form()});
    if (path.endsWith('/registrations')) return route.fulfill({json:[registration]});
    if (path.endsWith('/players')) return route.fulfill({json:{items:[player],totalCount:1}});
    if (path.endsWith('/player-sets')) return route.fulfill({json:[{id:'set',name:'Forwards'}]});
    if (path.endsWith('/base-price-tiers') || path.endsWith('/teams')) return route.fulfill({json:[]});
    if (path.endsWith('/settings')) return route.fulfill({json:{publicLiveViewEnabled:true}});
    return route.fulfill({json:{id:'cup',name:'Profile Cup',slug:'cup',status:'DRAFT',userRole:'OWNER',season:'2026',createdAtUtc:'2026-11-01T00:00:00Z'}});
  });
  return writes;
}
async function noCardSettings(page:Page) {
  await expect(page.getByText('Player card & ratings (optional)',{exact:true})).toHaveCount(0);
  await expect(page.getByLabel(/Card position|Calculated overall rating|Pace \(PAC\)/)).toHaveCount(0);
}
test('player setup saves photos and details without card settings',async({page}) => {
  const writes = await setup(page);
  await page.goto('/tournaments/cup');
  await page.getByRole('button',{name:'Player Registry',exact:true}).click();
  await page.getByRole('button',{name:'Add Player',exact:true}).first().click();
  await noCardSettings(page);
  await page.getByPlaceholder('e.g. Arjun Nair').fill('New Forward');
  await page.getByRole('button',{name:'Add Player',exact:true}).last().click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({name:'New Forward',position:'Midfielder',playerSetId:'set'});
  expect(writes[0]).not.toHaveProperty('ratings');
  expect(writes[0]).not.toHaveProperty('cardPosition');
  await page.getByTitle('Edit player',{exact:true}).click();
  await noCardSettings(page);
  await page.getByRole('button',{name:'Update Player',exact:true}).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1]).toMatchObject({name:player.name,photoUrl:photo,position:'Forward',jerseyNumber:9,previousTeam:'Falcons',shortBio:'Local forward'});
  expect(writes[1]).not.toHaveProperty('ratings');
});
test('registration and approval retain playing details without rating inputs',async({page}) => {
  const writes = await setup(page);
  await page.goto('/register/cup');
  await expect(page.getByLabel('Playing position')).toBeVisible();
  await expect(page.getByLabel('Full name',{exact:true})).toBeVisible();
  await noCardSettings(page);
  await page.goto('/tournaments/cup');
  await page.getByRole('button',{name:'Player Registrations',exact:true}).click();
  await page.getByRole('button',{name:'Review submission'}).click();
  await noCardSettings(page);
  await page.getByLabel('Auction player set').selectOption('set');
  await page.getByLabel('Base price',{exact:true}).fill('500');
  await page.getByRole('button',{name:'Approve & add player'}).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({approve:true,name:player.name,position:'Forward',jerseyNumber:9});
  expect(writes[0]).not.toHaveProperty('ratings');
  expect(writes[0]).not.toHaveProperty('cardPosition');
});
