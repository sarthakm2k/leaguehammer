import { test, expect, type Page } from 'playwright/test';

const photo = { name:'player.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=','base64') };
const submissionId = '11111111-1111-4111-8111-111111111111';
const receipt = { submissionId,reference:'LH-'+submissionId.replaceAll('-',''),submittedAtUtc:new Date().toISOString() };
async function setup(page:Page, available = true) {
  const state = { posts:[] as string[],fail:false,confirmed:false };
  await page.route('**/api/registration/cup**',route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.includes('/receipts/')) return state.confirmed ? route.fulfill({json:receipt}) : route.fulfill({status:404,json:{detail:'No confirmed submission with this reference.'}});
    if (path.endsWith('/submissions')) {
      state.posts.push(request.postDataBuffer()!.toString());
      if (state.fail) return route.fulfill({status:503,json:{detail:'Photo storage is temporarily unavailable. Please retry.'}});
      state.confirmed = true; return route.fulfill({json:receipt});
    }
    return route.fulfill({json:{tournamentId:'cup',tournamentName:'Photo Cup',slug:'cup',timeZone:'Asia/Kolkata',status:'OPEN',enabled:true,closedManually:false,finalizedAtUtc:null,serverTimeUtc:new Date().toISOString(),opensAtUtc:null,closesAtUtc:new Date(Date.now()+3600000).toISOString(),photoUploadAvailable:available}});
  });
  return state;
}
async function fill(page:Page) {
  await page.getByLabel('Full name',{exact:true}).fill('New Forward');
  await page.getByLabel('Contact number').fill('+919876543210');
  await page.getByRole('checkbox').check();
}
test('photo is required and invalid replacement cannot submit the previous file',async({page}) => {
  await page.setViewportSize({width:390,height:844});
  const state = await setup(page); await page.goto('/register/cup'); await fill(page);
  const input = page.getByLabel('Player photo (required)');
  await expect(input).toHaveJSProperty('required',true);
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  expect(await input.evaluate((node:HTMLInputElement) => node.validity.valueMissing)).toBe(true);
  expect(state.posts).toHaveLength(0);
  await input.setInputFiles(photo);
  await expect(page.getByRole('img',{name:'Selected player photo'})).toBeVisible();
  await input.setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG or WebP');
  await expect(page.getByRole('img',{name:'Selected player photo'})).toHaveCount(0);
  await expect(input).toHaveValue('');
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  expect(state.posts).toHaveLength(0);
  await input.setInputFiles(photo);
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  await expect(page.getByRole('heading',{name:'You’re registered.'})).toBeVisible();
  expect(state.posts).toHaveLength(1); expect(state.posts[0]).toContain('name="photo"; filename="player.png"');
  await page.getByRole('button',{name:'Register another player'}).click();
  await expect(input).toHaveValue(''); await expect(input).toHaveJSProperty('required',true);
});
test('unavailable photo storage prevents new registrations',async({page}) => {
  const state = await setup(page,false); await page.goto('/register/cup');
  await expect(page.getByLabel('Player photo (required)')).toBeDisabled();
  await expect(page.getByText('Photo uploads are unavailable.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'Submit registration',exact:true})).toBeDisabled();
  expect(state.posts).toHaveLength(0);
});
test('pending submission can recover its receipt without a photo when storage is unavailable',async({page}) => {
  const state = await setup(page,false);
  await page.addInitScript(({submissionId}) => localStorage.setItem('leaguehammer-registration-cup',JSON.stringify({submissionId,pending:true,hadPhoto:true,details:{name:'New Forward',phone:'+919876543210',position:'Forward',email:'',age:'',preferredFoot:''}})),{submissionId});
  await page.goto('/register/cup');
  const retry = page.getByRole('button',{name:'Check & retry submission'});
  await expect(retry).toBeEnabled();
  await expect(page.getByLabel('Player photo (required)')).toHaveJSProperty('required',false);
  state.confirmed = true;
  await retry.click();
  await expect(page.getByRole('heading',{name:'You’re registered.'})).toBeVisible();
  expect(state.posts).toHaveLength(0);
});
test('unconfirmed submission needs photo reselection after reload and keeps the same reference',async({page}) => {
  const state = await setup(page); state.fail = true;
  await page.goto('/register/cup'); await fill(page);
  await page.getByLabel('Player photo (required)').setInputFiles(photo);
  await page.getByRole('button',{name:'Submit registration',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  const id = await page.evaluate(() => JSON.parse(localStorage.getItem('leaguehammer-registration-cup')!).submissionId);
  await page.reload();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Check & retry submission'}).click();
  await expect(page.getByRole('alert')).toContainText('Please select your photo again');
  expect(state.posts).toHaveLength(1);
  state.fail = false;
  await page.getByLabel('Player photo (required)').setInputFiles(photo);
  await page.getByRole('button',{name:'Check & retry submission'}).click();
  await expect(page.getByRole('heading',{name:'You’re registered.'})).toBeVisible();
  expect(state.posts).toHaveLength(2); expect(state.posts.every(body => body.includes(id))).toBe(true);
});
test('clearing a draft clears the selected photo and requires a fresh selection',async({page}) => {
  await setup(page); await page.goto('/register/cup'); await fill(page);
  await page.getByLabel('Player photo (required)').setInputFiles(photo);
  await page.getByRole('button',{name:'Clear draft'}).click();
  await expect(page.getByLabel('Player photo (required)')).toHaveValue('');
  await expect(page.getByRole('img',{name:'Selected player photo'})).toHaveCount(0);
  await expect(page.getByLabel('Player photo (required)')).toHaveJSProperty('required',true);
});
