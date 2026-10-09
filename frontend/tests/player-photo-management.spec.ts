import { test, expect, type Page } from 'playwright/test';
const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lime"/></svg>');
async function setup(page:Page,role='OWNER'){
  let fail=false,writes=0;const player={id:'player',name:'Arjun Menon',playerSetId:'set',playerSetName:'Forwards',status:'SOLD',basePrice:500,position:'Forward',photoUrl:null as string|null};
  await page.addInitScript(()=>localStorage.setItem('auth_token','test-token'));
  await page.route('**/api/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(path.endsWith('/photo')){writes++;expect(req.headers().authorization).toBe('Bearer test-token');if(fail)return route.fulfill({status:503,json:{detail:'Photo storage unavailable'}});
      if(req.method()==='POST'){expect(req.headers()['content-type']).toContain('multipart/form-data');expect(req.postDataBuffer()?.includes(Buffer.from('name="photo"'))).toBe(true);player.photoUrl=photo;}else {expect(req.method()).toBe('DELETE');player.photoUrl=null;}
      return route.fulfill({json:{photoUrl:player.photoUrl}});
    }
    if(path.endsWith('/players'))return route.fulfill({json:{items:[player],totalCount:1}});
    if(path.endsWith('/player-sets'))return route.fulfill({json:[{id:'set',name:'Forwards'}]});
    if(path.endsWith('/base-price-tiers')||path.endsWith('/teams'))return route.fulfill({json:[]});
    if(path.endsWith('/settings'))return route.fulfill({json:{publicLiveViewEnabled:true}});
    return route.fulfill({json:{id:'cup',name:'PJL Season 4',slug:'pjl',status:'COMPLETED',userRole:role,season:'2026',createdAtUtc:'2026-10-09T00:00:00Z'}});
  });
  await page.goto('/tournaments/cup');await page.getByRole('button',{name:'Player Registry',exact:true}).click();
  return {fail:()=>{fail=true;},writes:()=>writes};
}
const file={name:'portrait.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])};
test('owner adds replaces and removes player photos in completed tournaments',async({page})=>{
  await page.setViewportSize({width:390,height:844});const controls=await setup(page);
  const open=()=>page.getByRole('button',{name:'Manage photo for Arjun Menon',exact:true}).click();await open();
  await page.getByLabel('Choose player photo').setInputFiles(file);await page.getByRole('button',{name:'Upload photo',exact:true}).click();
  await expect(page.getByText('Player photo updated.',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Arjun Menon',exact:true})).toHaveAttribute('src',photo);
  await open();await page.getByLabel('Choose player photo').setInputFiles(file);await page.getByRole('button',{name:'Replace photo',exact:true}).click();
  await open();page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Remove photo',exact:true}).click();expect(controls.writes()).toBe(2);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove photo',exact:true}).click();
  await expect(page.getByText('Player photo removed.',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Arjun Menon',exact:true})).toHaveCount(0);expect(controls.writes()).toBe(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('invalid files and storage failure preserve existing profile',async({page})=>{
  const controls=await setup(page);await page.getByRole('button',{name:'Manage photo for Arjun Menon',exact:true}).click();
  await page.getByLabel('Choose player photo').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.getByRole('alert')).toContainText('up to 3 MB');expect(controls.writes()).toBe(0);
  controls.fail();await page.getByLabel('Choose player photo').setInputFiles(file);await page.getByRole('button',{name:'Upload photo',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Photo storage unavailable');await expect(page.getByRole('dialog')).toBeVisible();
});
test('auctioneer cannot access owner photo controls',async({page})=>{
  await setup(page,'AUCTIONEER');await expect(page.getByRole('button',{name:'Manage photo for Arjun Menon',exact:true})).toHaveCount(0);
});
