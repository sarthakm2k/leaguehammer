import { test, expect } from 'playwright/test';
import { calculateOverall } from '../src/features/players/playerCardTypes';

test('position weights, missing attributes and broad position fallbacks calculate correctly', () => {
  const values={pace:90,shooting:80,passing:70,dribbling:60,defending:50,physical:40,diving:90,handling:80,kicking:70,reflexes:60,speed:50,positioning:40};
  const expected:Record<string,number>={ST:72,CF:71,LW:73,RW:73,LM:70,RM:70,CAM:69,CM:65,CDM:60,CB:56,LB:63,RB:63,LWB:67,RWB:67,GK:69};
  for(const [position,overall] of Object.entries(expected)) {
    expect(calculateOverall(values,position)).toBe(overall);
    expect(calculateOverall({},position)).toBeNull();
    expect(calculateOverall(Object.fromEntries(Object.keys(values).map(key=>[key,99])),position)).toBe(99);
  }
  expect(calculateOverall({pace:99,shooting:80},'ST')).toBe(87);
  expect(calculateOverall({passing:80},'ST')).toBe(80);
  expect(calculateOverall({pace:99},'GK')).toBeNull();
  expect(calculateOverall(values,null,'Forward')).toBe(72);
  expect(calculateOverall(values,null,'Midfielder')).toBe(65);
  expect(calculateOverall(values,null,'Defender')).toBe(56);
  expect(calculateOverall(values,null,'Goalkeeper')).toBe(69);
  expect(calculateOverall(values)).toBe(65);
  expect(calculateOverall(values,'LW','Defender')).toBe(73);
});

const API = process.env.AUCTION_API_URL || 'http://localhost:5051';
test.use({ actionTimeout: 15000 });
test('registration position, ratings validation, automatic overall and live cards work end to end', async ({ browser, request }) => {
  const auth = await request.post(`${API}/api/auth/register`, { data:{ email:`cards-${Date.now()}@example.test`,password:'CardVerification!2026',fullName:'Card Verification' } });
  expect(auth.ok(),await auth.text()).toBeTruthy(); const { token } = await auth.json();
  const headers = { Authorization:`Bearer ${token}` };
  const api = async (method:'get'|'put'|'post',path:string,data?:unknown) => {
    const response=await request[method](`${API}/api${path}`,{headers,data}); expect(response.ok(),await response.text()).toBeTruthy(); return response.json();
  };
  const tournament=await api('post','/tournaments',{name:`Player Card Cup ${Date.now()}`,season:'2026'});
  const root=`/tournaments/${tournament.id}`;
  await api('put',`${root}/settings`,{currencyCode:'INR',currencySymbol:'₹',defaultStartingPurse:10000,minimumSquadSize:1,maximumSquadSize:4,minimumAcquisitionPrice:500,defaultBidIncrement:250,publicLiveViewEnabled:true});
  const team=await api('post',`${root}/teams`,{name:'Falcons FC',shortName:'FLC',initialPurse:10000});
  const second=await api('post',`${root}/teams`,{name:'Warriors FC',shortName:'WAR',initialPurse:10000});
  const set=await api('post',`${root}/player-sets`,{name:'Rated forwards',sortOrder:1});
  const keeperSet=await api('post',`${root}/player-sets`,{name:'Rated keepers',sortOrder:2});
  await api('put',`${root}/registrations/settings`,{enabled:true,opensAtUtc:new Date(Date.now()-60000).toISOString(),closesAtUtc:new Date(Date.now()+3600000).toISOString(),closedManually:false,instructions:null});
  const publicContext=await browser.newContext(); const owner=await browser.newContext();
  await owner.addInitScript(value=>localStorage.setItem('auth_token',value),token);
  const registration=await publicContext.newPage(); const editor=await owner.newPage();
  const errors:string[]=[]; registration.on('pageerror',e=>errors.push(e.message)); editor.on('pageerror',e=>errors.push(e.message));
  try {
    await registration.setViewportSize({width:390,height:844}); await registration.goto(`/register/${tournament.slug}`);
    await registration.getByLabel('Full name',{exact:true}).fill('Registered Winger');
    await registration.getByLabel('Contact number').fill('+919876543210');
    await registration.getByLabel('Card position (optional)').selectOption('LW');
    await registration.getByRole('checkbox').check(); await registration.getByRole('button',{name:'Submit registration'}).click();
    await expect(registration.getByRole('heading',{name:'You’re registered.'})).toBeVisible();
    const entries=await api('get',`${root}/registrations`); expect(entries[0].cardPosition).toBe('LW');
    await api('post',`${root}/registrations/${entries[0].id}/review`,{approve:true,name:entries[0].name,phone:entries[0].phone,email:null,age:null,position:'Forward',preferredFoot:null,jerseyNumber:null,previousTeam:null,shortBio:null,playerSetId:set.id,basePrice:500,reason:null,cardPosition:'LW',ratings:{pace:99,shooting:80}});
    const winger=(await api('get',`${root}/players`)).items[0]; expect(winger.cardPosition).toBe('LW'); expect(winger.ratings.overall).toBe(91); expect(winger.ratings.attributes.passing).toBeNull();
    const invalid=await request.post(`${API}/api${root}/players`,{headers,data:{name:'Invalid Rating',playerSetId:set.id,basePrice:500,position:'Forward',ratings:{pace:100}}});
    expect(invalid.status()).toBe(400);
    // Old players with omitted ratings stay empty; organisers can add them later.
    const keeper=await api('post',`${root}/players`,{name:'Keeper Signing',playerSetId:keeperSet.id,basePrice:500,position:'Goalkeeper',cardPosition:'GK',ratings:{diving:99,handling:90,kicking:80,reflexes:97,speed:60,positioning:90}});
    expect(keeper.ratings.overall).toBe(92); expect(keeper.ratings.isGoalkeeper).toBe(true);
    await editor.goto(root); await editor.getByRole('button',{name:'Player Registry',exact:true}).click();
    await editor.getByRole('button',{name:'Add Player',exact:true}).first().click();
    await editor.getByPlaceholder('e.g. Arjun Nair').fill('Preview Player');
    await editor.getByLabel('Card position',{exact:true}).selectOption('ST');
    await editor.getByLabel('Pace (PAC)',{exact:true}).fill('100');
    await expect(editor.getByLabel('Pace (PAC)',{exact:true})).toHaveValue('99');
    await editor.getByLabel('Shooting (SHO)',{exact:true}).fill('81');
    await expect(editor.getByLabel('Calculated overall rating')).toHaveText('88');
    await editor.getByLabel('Card position',{exact:true}).selectOption('LW');
    await expect(editor.getByLabel('Calculated overall rating')).toHaveText('92');
    await editor.getByLabel('Card position',{exact:true}).selectOption('CB');
    await expect(editor.getByLabel('Calculated overall rating')).toHaveText('93');
    await editor.getByLabel('Pace (PAC)',{exact:true}).fill(''); await editor.getByLabel('Shooting (SHO)',{exact:true}).fill('');
    await expect(editor.getByLabel('Calculated overall rating')).toBeEmpty();
    await editor.getByLabel('Card position',{exact:true}).selectOption('GK');
    await expect(editor.getByLabel('Diving (DIV)',{exact:true})).toBeVisible();
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    await api('post',`${root}/registrations/finalize`);
    await api('post',`${root}/preflight/approve-ready`); await api('post',`${root}/auction/start`); await api('post',`${root}/auction/start-set`,{setId:set.id});
    const revealed=await api('post',`${root}/auction/reveal-next`); expect(revealed.currentLot.ratings.overall).toBe(91);
    const publicState=(await request.get(`${API}/api/public/tournaments/${tournament.slug}/auction-state`)); expect(publicState.ok()).toBeTruthy(); expect((await publicState.json()).currentLot.cardPosition).toBe('LW');
    const consolePage=await owner.newPage(); const stage=await publicContext.newPage(); const portal=await publicContext.newPage();
    await Promise.all([consolePage.goto(`${root}/auction`),stage.goto(`/live/${tournament.slug}/projector`),portal.goto(`/live/${tournament.slug}`)]);
    for (const page of [consolePage,stage,portal]) {
      const card=page.getByRole('article',{name:'Registered Winger player card'});
      await expect(card).toBeVisible(); await expect(card.getByLabel('Overall 91')).toHaveText('91'); await expect(card.getByLabel('Pace 99')).toHaveText('99'); await expect(card.getByLabel('Passing not rated')).toBeEmpty();
    }
    await api('post',`${root}/auction/sell`,{lotId:revealed.currentLot.lotId,winningTeamId:team.id,finalPrice:500});
    await api('post',`${root}/auction/sets/${set.id}/complete`); await api('post',`${root}/auction/start-set`,{setId:keeperSet.id}); await api('post',`${root}/auction/reveal-next`);
    for (const page of [consolePage,stage,portal]) {
      const card=page.getByRole('article',{name:'Keeper Signing player card'});
      await expect(card).toBeVisible(); await expect(card.getByLabel('Overall 92')).toHaveText('92'); await expect(card.getByLabel('Diving 99')).toHaveText('99'); await expect(card.getByLabel('Speed 60')).toHaveText('60');
    }
    for (const size of [{width:1366,height:650},{width:1024,height:600},{width:390,height:844}]) {
      await stage.setViewportSize(size); expect(await stage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const card=stage.locator('.football-player-card'); const image=card.locator('img');
      const bounds=await card.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.width/bounds!.height).toBeCloseTo(2/3,2);
      if(await image.count()) await expect(image).toHaveCSS('object-fit','contain');
      if(size.width>900) expect(await stage.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    }
    await stage.setViewportSize({width:1366,height:650}); await stage.screenshot({path:'../.cache/player-card-projector.png'});
    await api('post',`${root}/auction/sell`,{lotId:(await api('get',`${root}/auction`)).currentLot.lotId,winningTeamId:second.id,finalPrice:500});
    const results=await api('get',`${root}/results`); expect(results.players.find((p:{playerId:string})=>p.playerId===keeper.id).ratings.overall).toBe(92);
    expect(errors).toEqual([]);
  } finally { await publicContext.close(); await owner.close(); }
});
