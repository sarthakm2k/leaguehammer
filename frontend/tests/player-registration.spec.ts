import { test, expect } from 'playwright/test';

const API = process.env.AUCTION_API_URL || 'http://localhost:5050';
test('registration survives cold start and lost response; organiser reviews, approves and finalizes', async ({ browser, request }, testInfo) => {
  const account = await request.post(`${API}/api/auth/register`, { data: { email: `registration-${Date.now()}@example.test`, password: 'RegistrationTest!2026', fullName: 'Registration Owner' } });
  expect(account.ok()).toBeTruthy(); const { token } = await account.json(); const headers = { Authorization: `Bearer ${token}` };
  const api = async (method: 'get' | 'post' | 'put', path: string, data?: unknown) => {
    const response = await request[method](`${API}/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  };
  const tournament = await api('post', '/tournaments', { name: `Registration Cup ${Date.now()}`, season: '2026' });
  const root = `/tournaments/${tournament.id}`;
  const set = await api('post', `${root}/player-sets`, { name: 'Forwards', sortOrder: 1 });
  const settings = { enabled: true, opensAtUtc: new Date(Date.now() - 60000).toISOString(), closesAtUtc: new Date(Date.now() + 3600000).toISOString(), closedManually: false, instructions: 'All positions welcome.' };
  await api('put', `${root}/registrations/settings`, settings);
  const guest = await browser.newContext({ viewport: { width: 320, height: 844 } });
  const organiser = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await organiser.addInitScript(value => localStorage.setItem('auth_token', value), token);
  const page = await guest.newPage(); const owner = await organiser.newPage(); const errors: string[] = [];
  for (const view of [page, owner]) view.on('pageerror', e => errors.push(e.message));
  let coldRequests = 0;
  await page.route(`**/api/registration/${tournament.slug}`, async route => {
    if (++coldRequests <= 2) await route.abort('failed'); else await route.continue();
  });
  try {
    await page.goto(`/register/${tournament.slug}`);
    await expect(page.getByText('The registration service is starting', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Full name')).toBeVisible({ timeout: 20000 });
    await page.getByLabel('Full name').fill('Mobile Player'); await page.getByLabel('Contact number').fill('+91 9876543210');
    await page.getByLabel('Age (optional)').fill('24');
    for (const field of ['Jersey number', 'Previous team', 'About you']) await expect(page.getByLabel(field)).toHaveCount(0);
    // Older saved drafts must not silently submit fields removed from registration.
    await page.evaluate(slug => {
      const key = `leaguehammer-registration-${slug}`; const draft = JSON.parse(localStorage.getItem(key)!);
      Object.assign(draft.details, { jerseyNumber: '10', previousTeam: 'Old team', shortBio: 'Old biography' });
      localStorage.setItem(key, JSON.stringify(draft));
    }, tournament.slug);
    await page.reload(); await expect(page.getByLabel('Full name')).toHaveValue('Mobile Player');
    await page.getByRole('checkbox').check();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('registration-dark-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: testInfo.outputPath('registration-light-mobile.png'), fullPage: true });
    // The server commits, but the browser loses the response. A reload must recover that same receipt.
    await page.route(`**/api/registration/${tournament.slug}/submissions`, async route => { const response = await route.fetch(); expect(response.ok(), await response.text()).toBeTruthy(); await route.abort('failed'); });
    await page.getByRole('button', { name: 'Submit registration', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('could not confirm');
    const saved = await page.evaluate(slug => JSON.parse(localStorage.getItem(`leaguehammer-registration-${slug}`)!), tournament.slug);
    expect(saved.pending).toBeTruthy();
    await page.reload(); await expect(page.getByRole('heading', { name: 'You’re registered.' })).toBeVisible();
    await expect(page.locator('.registration-success code')).toHaveText(`LH-${saved.submissionId.replaceAll('-', '')}`);
    expect(await page.evaluate(slug => localStorage.getItem(`leaguehammer-registration-${slug}`), tournament.slug)).toBeNull();
    const registry = await api('get', `${root}/players`); expect(registry.totalCount).toBe(0);
    // The same phone/browser can register a different player with a fresh reference.
    await page.unroute(`**/api/registration/${tournament.slug}/submissions`);
    await page.getByRole('button', { name: 'Register another player' }).click();
    await expect(page.getByLabel('Full name')).toHaveValue('');
    await expect(page.getByLabel('Contact number')).toHaveValue('');
    await expect(page.getByRole('checkbox')).not.toBeChecked();
    await page.getByLabel('Full name').fill('Second Player');
    await page.getByLabel('Contact number').fill('+91 9876543210');
    await page.getByLabel('Playing position').selectOption('Defender'); await page.getByRole('checkbox').check();
    const secondDraft = await page.evaluate(slug => JSON.parse(localStorage.getItem(`leaguehammer-registration-${slug}`)!), tournament.slug);
    expect(secondDraft.submissionId).not.toBe(saved.submissionId);
    await page.getByRole('button', { name: 'Submit registration', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You’re registered.' })).toBeVisible();
    await expect(page.locator('.registration-success code')).toHaveText(`LH-${secondDraft.submissionId.replaceAll('-', '')}`);
    // PostgreSQL locking handles two simultaneous retries, including after the form is closed.
    const concurrentId = secondDraft.submissionId;
    const payload = { submissionId: concurrentId, name: 'Second Player', phone: '+91 9876543210', position: 'Defender', consent: 'true' };
    const retries = await Promise.all([request.post(`${API}/api/registration/${tournament.slug}/submissions`, { multipart: payload }), request.post(`${API}/api/registration/${tournament.slug}/submissions`, { multipart: payload })]);
    for (const response of retries) expect(response.ok(), await response.text()).toBeTruthy();
    const queue = await api('get', `${root}/registrations`);
    expect(queue.length).toBe(2); expect(queue.every((entry: { hasPhoto: boolean }) => entry.hasPhoto === false)).toBeTruthy();
    expect(queue.every((entry: { jerseyNumber: number | null; previousTeam: string | null; shortBio: string | null }) => entry.jerseyNumber === null && entry.previousTeam === null && entry.shortBio === null)).toBeTruthy();
    await api('put', `${root}/registrations/settings`, { ...settings, closedManually: true });
    expect((await request.post(`${API}/api/registration/${tournament.slug}/submissions`, { multipart: payload })).ok()).toBeTruthy();
    const late = await request.post(`${API}/api/registration/${tournament.slug}/submissions`, { multipart: { ...payload, submissionId: crypto.randomUUID() } }); expect(late.status()).toBe(409);
    const receipt = await request.get(`${API}/api/registration/${tournament.slug}/receipts/${saved.submissionId}`);
    expect(Object.keys(await receipt.json()).sort()).toEqual(['reference', 'submissionId', 'submittedAtUtc']);
    const privateQueue = await request.get(`${API}/api${root}/registrations`); expect(privateQueue.status()).toBe(401);
    const privatePhoto = await request.get(`${API}/api${root}/registrations/${saved.submissionId}/photo`); expect(privatePhoto.status()).toBe(401);
    await owner.goto(root); await owner.getByRole('button', { name: 'Player Registrations', exact: true }).click();
    await expect(owner.getByLabel('Player registration link')).toHaveValue(new URL(`/register/${tournament.slug}`, owner.url()).href);
    await expect(owner.getByRole('button', { name: 'Finalize registration', exact: true })).toBeDisabled();
    const first = owner.locator('.registration-entry').filter({ hasText: 'Mobile Player' });
    await expect(first).toContainText('Possible duplicate'); await first.getByRole('button', { name: 'Review submission' }).click();
    const review = owner.getByRole('region', { name: 'Review player submission' });
    for (const field of ['Jersey number', 'Previous team', 'About you']) await expect(review.getByLabel(field)).toHaveCount(0);
    await review.getByLabel('Full name').fill('Verified Mobile Player'); await review.getByLabel('Auction player set').selectOption(set.id);
    await review.getByLabel('Base price', { exact: true }).fill('500'); await review.getByRole('checkbox').check();
    await review.getByRole('button', { name: 'Approve & add player' }).click();
    await expect(owner.getByRole('status')).toContainText('Player approved');
    const second = owner.locator('.registration-entry').filter({ hasText: 'Second Player' }); await second.getByRole('button', { name: 'Review submission' }).click();
    await review.getByLabel('Review note / rejection reason').fill('Duplicate application.'); await review.getByRole('button', { name: 'Reject submission' }).click();
    await expect(owner.getByRole('status')).toContainText('Submission rejected');
    owner.once('dialog', dialog => void dialog.accept()); await owner.getByRole('button', { name: 'Finalize registration', exact: true }).click();
    await expect(owner.getByRole('status')).toContainText('Registration finalized');
    const finalPlayers = await api('get', `${root}/players`); expect(finalPlayers.totalCount).toBe(1); expect(finalPlayers.items[0].name).toBe('Verified Mobile Player');
    expect(finalPlayers.items[0].phone).toBeUndefined();
    const preflight = await api('get', `${root}/preflight`); expect(preflight.checks.find((c: { key: string }) => c.key === 'REGISTRATION_FINALIZED').status).toBe('PASS');
    await owner.getByRole('button', { name: 'Player Registry', exact: true }).click(); await expect(owner.getByText('Verified Mobile Player', { exact: true })).toBeVisible();
    const closedPage = await guest.newPage(); await closedPage.goto(`/register/${tournament.slug}`); await expect(closedPage.getByText('Registration is closed.', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await guest.close(); await organiser.close(); }
});
