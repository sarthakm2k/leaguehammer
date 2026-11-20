import { test, expect, type Page } from 'playwright/test';

const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lime"/></svg>');
async function setup(page:Page,status='DRAFT',finalized=false) {
  const entry={id:'entry',name:'Arjun Menon',phone:'919876543210',email:'player@example.test',age:24,position:'Forward',preferredFoot:'Right',jerseyNumber:9,previousTeam:'Falcons',shortBio:'Local forward',status:'APPROVED',playerId:'player' as string|null,hasPhoto:true,photoUrl:null,reviewReason:null as string|null,submittedAtUtc:'2026-11-18T07:00:00Z',reviewedAtUtc:'2026-11-18T08:00:00Z'};
  const state={entry,players:[{id:'player',name:entry.name,playerSetId:'set',basePrice:500,position:'Forward',photoUrl:photo}],writes:[] as {path:string;data:Record<string,unknown>}[],fail:''};
  await page.addInitScript(()=>localStorage.setItem('auth_token','owner-token'));
  await page.route('**/api/**',route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'owner',fullName:'Owner'}});
    if(path.endsWith('/undo-approval')||path.endsWith('/reject-approved')){
      expect(request.headers().authorization).toBe('Bearer owner-token');expect(request.method()).toBe('POST');
      const data=request.postDataJSON();state.writes.push({path,data});
      if(state.fail)return route.fulfill({status:409,json:{detail:state.fail}});
      expect(data.playerId).toBe(entry.playerId);entry.status=path.endsWith('/undo-approval') ? 'PENDING':'REJECTED';entry.playerId=null;
      entry.reviewReason=entry.status==='REJECTED' ? data.reason:null;state.players=[];return route.fulfill({json:{submissionId:entry.id}});
    }
    if(path.endsWith('/review')){
      const data=request.postDataJSON();state.writes.push({path,data});entry.status='APPROVED';entry.playerId='reapproved-player';
      state.players=[{id:'reapproved-player',name:entry.name,playerSetId:'set',basePrice:500,position:'Forward',photoUrl:photo}];return route.fulfill({json:{}});
    }
    if(path.endsWith('/photo'))return route.fulfill({json:{photoUrl:photo}});
    if(path.endsWith('/registrations/settings'))return route.fulfill({json:{tournamentId:'cup',slug:'cup',timeZone:'Asia/Kolkata',status:finalized ? 'FINALIZED':'OPEN',enabled:true,photoUploadAvailable:true,finalizedAtUtc:finalized ? '2026-11-18T09:00:00Z':null,opensAtUtc:null,closesAtUtc:null}});
    if(path.endsWith('/registrations'))return route.fulfill({json:[entry]});
    if(path.endsWith('/view-link'))return route.fulfill({json:{path:'/registrations/cup/view/view-token'}});
    if(path.includes('/registration/cup/view/'))return route.fulfill({json:{tournamentName:'Approval Cup',timeZone:'Asia/Kolkata',updatedAtUtc:new Date().toISOString(),players:[entry]}});
    if(path.endsWith('/players'))return route.fulfill({json:{items:state.players,totalCount:state.players.length}});
    if(path.endsWith('/player-sets'))return route.fulfill({json:[{id:'set',name:'Forwards'}]});
    if(path.endsWith('/base-price-tiers')||path.endsWith('/teams'))return route.fulfill({json:[]});
    if(path.endsWith('/settings'))return route.fulfill({json:{publicLiveViewEnabled:true}});
    return route.fulfill({json:{id:'cup',name:'Approval Cup',slug:'cup',status,userRole:'OWNER',season:'2026',timeZone:'Asia/Kolkata',createdAtUtc:'2026-11-01T00:00:00Z'}});
  });
  await page.goto('/tournaments/cup');await page.getByRole('button',{name:'Player Registrations',exact:true}).click();
  await page.getByLabel('Submission status').selectOption('APPROVED');
  await expect(page.locator('.registration-entry')).toContainText('Arjun Menon');
  return state;
}
test('undo approval confirms removal, preserves the submission photo, and permits re-approval',async({page})=>{
  const state=await setup(page);
  await page.getByRole('button',{name:'Undo approval',exact:true}).click();
  let dialog=page.getByRole('dialog');await expect(dialog).toContainText('removes the player from Player Registry');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();expect(state.writes).toHaveLength(0);
  await page.getByRole('button',{name:'Undo approval',exact:true}).click();
  dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Undo approval',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.getByLabel('Submission status')).toHaveValue('PENDING');
  await expect(page.locator('.registration-entry .registration-status')).toHaveText('PENDING');
  expect(state.players).toHaveLength(0);expect(state.entry.hasPhoto).toBe(true);
  expect(state.writes[0].data).toEqual({playerId:'player',reason:null});
  await page.getByRole('button',{name:'Review submission'}).click();
  await expect(page.getByRole('img',{name:'Arjun Menon submitted photo'})).toHaveAttribute('src',photo);
  await expect(page.getByLabel('Full name')).toHaveValue('Arjun Menon');
  await page.getByLabel('Auction player set').selectOption('set');await page.getByLabel('Base price',{exact:true}).fill('500');
  await page.getByRole('button',{name:'Approve & add player'}).click();
  await expect(page.getByText('Player approved and added to the registry.',{exact:true})).toBeVisible();
  expect(state.entry.status).toBe('APPROVED');expect(state.players[0].id).toBe('reapproved-player');
});
test('rejecting an approved registration requires a reason and updates the read-only list',async({page})=>{
  const state=await setup(page);await page.getByRole('button',{name:'Reject registration',exact:true}).click();
  const dialog=page.getByRole('dialog'),confirm=dialog.getByRole('button',{name:'Reject registration',exact:true});
  await expect(confirm).toBeDisabled();await dialog.getByLabel('Reason for rejection').fill('   ');await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Reason for rejection').fill('Player withdrew');await confirm.click();
  await expect(dialog).toHaveCount(0);await expect(page.getByLabel('Submission status')).toHaveValue('REJECTED');
  await expect(page.locator('.registration-entry')).toContainText('Player withdrew');
  expect(state.writes[0].data).toEqual({playerId:'player',reason:'Player withdrew'});expect(state.players).toHaveLength(0);
  await page.goto('/registrations/cup/view/view-token');
  await expect(page.locator('.registration-viewer-player .registration-status')).toHaveText('Not selected');
  await expect(page.getByRole('button',{name:'Undo approval',exact:true})).toHaveCount(0);
});
test('blocked auction changes keep the registration approved and show the error inside the dialog',async({page})=>{
  const state=await setup(page);state.fail='This player has already entered an auction. Their approval cannot be changed.';
  await page.getByRole('button',{name:'Undo approval',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Undo approval',exact:true}).click();
  await expect(dialog.getByRole('alert')).toHaveText(state.fail);expect(state.entry.status).toBe('APPROVED');expect(state.players).toHaveLength(1);
  await dialog.getByRole('button',{name:'Cancel'}).click();await expect(page.locator('.registration-entry .registration-status')).toHaveText('APPROVED');
});
for(const [status,finalized] of [['DRAFT',true],['READY',false]] as const) test(`approval actions are disabled when ${finalized ? 'registration is finalized':'tournament is ready'}`,async({page})=>{
  const state=await setup(page,status,finalized);await expect(page.getByRole('button',{name:'Undo approval',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Reject registration',exact:true})).toBeDisabled();expect(state.writes).toHaveLength(0);
});
test('mobile confirmation fits the screen and Escape cancels without changing the registration',async({page})=>{
  await page.setViewportSize({width:390,height:844});const state=await setup(page);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Reject registration',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Reason for rejection').fill('Unsaved reason');
    const bounds=await dialog.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(width===390)await page.screenshot({path:'../.cache/registration-reject-mobile.png'});
    await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  }
  expect(state.writes).toHaveLength(0);expect(state.entry.status).toBe('APPROVED');
});
