import { test, expect } from 'playwright/test';
const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lime"/></svg>');
const png={name:'portrait.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])};
test('reviewer uploads replaces and removes registration photos without resetting review details',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.addInitScript(()=>localStorage.setItem('auth_token','test-token'));
  let writes=0,fail=false;
  const entry={id:'entry',name:'Arjun Menon',phone:'919876543210',position:'Forward',email:null,age:24,preferredFoot:'Right',status:'PENDING',hasPhoto:false,photoUrl:null as string|null,submittedAtUtc:'2026-10-09T00:00:00Z'};
  await page.route('**/api/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(path.endsWith('/registrations/settings'))return route.fulfill({json:{tournamentId:'cup',slug:'cup',timeZone:'Asia/Kolkata',status:'OPEN',enabled:true,photoUploadAvailable:true}});
    if(path.endsWith('/photo')){if(req.method()==='GET')return route.fulfill({json:{photoUrl:entry.photoUrl}});writes++;expect(req.headers().authorization).toBe('Bearer test-token');if(fail)return route.fulfill({status:503,json:{detail:'Photo storage unavailable'}});
      if(req.method()==='POST'){expect(req.headers()['content-type']).toContain('multipart/form-data');entry.hasPhoto=true;entry.photoUrl=photo;}else{expect(req.method()).toBe('DELETE');entry.hasPhoto=false;entry.photoUrl=null;}
      return route.fulfill({json:{photoUrl:entry.photoUrl,hasPhoto:entry.hasPhoto}});
    }
    if(path.endsWith('/review')){expect(req.postDataJSON().name).toBe('Arjun Reviewed');entry.status='APPROVED';return route.fulfill({json:{}});}
    if(path.endsWith('/registrations'))return route.fulfill({json:[entry]});
    if(path.endsWith('/player-sets'))return route.fulfill({json:[{id:'set',name:'Forwards'}]});
    if(path.endsWith('/base-price-tiers')||path.endsWith('/teams'))return route.fulfill({json:[]});
    if(path.endsWith('/settings'))return route.fulfill({json:{}});
    return route.fulfill({json:{id:'cup',name:'PJL Season 4',slug:'cup',status:'DRAFT',userRole:'OWNER',season:'2026'}});
  });
  await page.goto('/tournaments/cup');await page.getByRole('button',{name:'Player Registrations',exact:true}).click();await page.getByRole('button',{name:'Review submission',exact:true}).click();
  await page.getByLabel('Full name').fill('Arjun Reviewed');
  await page.getByLabel('Choose registration photo').setInputFiles(png);await page.getByRole('button',{name:'Upload registration photo',exact:true}).click();await expect(page.getByRole('img',{name:'Arjun Menon submitted photo'})).toBeVisible();
  await page.getByLabel('Choose registration photo').setInputFiles(png);await page.getByRole('button',{name:'Replace registration photo',exact:true}).click();await expect(page.getByLabel('Choose registration photo')).toHaveValue('');
  fail=true;await page.getByLabel('Choose registration photo').setInputFiles(png);await page.getByRole('button',{name:'Replace registration photo',exact:true}).click();await expect(page.getByRole('alert').first()).toContainText('Photo storage unavailable');await expect(page.getByRole('img',{name:'Arjun Menon submitted photo'})).toBeVisible();fail=false;
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove registration photo',exact:true}).click();await expect(page.getByRole('img',{name:'Arjun Menon submitted photo'})).toHaveCount(0);await expect(page.getByLabel('Full name')).toHaveValue('Arjun Reviewed');
  await page.getByLabel('Choose registration photo').setInputFiles(png);await page.getByRole('button',{name:'Upload registration photo',exact:true}).click();
  await page.getByLabel('Auction player set').selectOption('set');await page.getByLabel('Base price',{exact:true}).fill('500');await page.getByRole('button',{name:'Approve & add player',exact:true}).click();await expect(page.getByText('Player approved and added to the registry.',{exact:true})).toBeVisible();expect(writes).toBe(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
