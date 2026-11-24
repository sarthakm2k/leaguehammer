import { test, expect, type BrowserContext, type WebSocketRoute } from 'playwright/test';
import type { FanAdmin, FanPage } from '../src/features/fan-choice/fanChoiceApi';

const categories = [
  ['BEST_BUY', 'Best Auction Buy'], ['STRONGEST_SQUAD', 'Strongest Squad'], ['FAVOURITE_PLAYER', 'Fan Favourite Player'],
  ['BEST_CAPTAIN', 'Best Captain Pick'], ['BEST_ICON', 'Best Icon Pick'],
];
function fixture(): FanPage {
  return { tournamentId: 'fan-cup', tournamentName: 'Malabar Premier League · Season 4', slug: 'fan-cup', logoUrl: null, currencyCode: 'INR',
    polls: categories.map(([category, title]) => ({ id: category, category, title, description: category === 'STRONGEST_SQUAD' ? 'Which complete squad looks strongest, including captains and icons?' : 'Choose the player who deserves your spotlight.',
      isOpen: true, selectedOptionId: null, totalVotes: null, options: ['Arjun Menon', 'Rohan Nair', 'Nikhil Varma'].map((name, i) => ({ id: `${category}-${i}`, name: category === 'STRONGEST_SQUAD' ? ['Malabar Falcons', 'Coastal Warriors', 'Northern Royals'][i] : name,
        photoUrl: '/brand/player-avatar.svg', subtitle: `${i === 0 ? 'Malabar Falcons' : 'Coastal Warriors'} · ${category === 'BEST_ICON' ? 'Icon player' : 'Forward'}`, price: category === 'BEST_BUY' ? [7500, 12000, 4500][i] : null,
        squad: category === 'STRONGEST_SQUAD' ? [{ name: 'Arjun Menon', photoUrl: null, position: 'Forward', role: 'CAPTAIN' }, { name: 'Rohan Nair', photoUrl: null, position: 'Midfielder', role: 'ICON' }, { name: 'Nikhil Varma', photoUrl: null, position: 'Defender', role: 'ICON' }] : null,
        votes: null, percentage: null })) })) };
}

class FanServer {
  data = fixture();
  votes = new Map<string, string>();
  sockets: WebSocketRoute[] = [];
  joins: string[] = [];
  posts = 0;
  loseResponse = false;
  unavailable = false;
  enabled = new Set(categories.map(([category]) => category));
  publicEnabled = true;
  configWrites: { category: string; enabled: boolean; isOpen: boolean }[] = [];
  notify() { for (const socket of this.sockets) socket.send(JSON.stringify({ type: 1, target: 'FanChoiceChanged', arguments: [{ tournamentId: this.data.tournamentId }] }) + '\u001e'); }
  page(token: string): FanPage {
    return { ...this.data, polls: this.data.polls.filter(p => this.enabled.has(p.category)).map(poll => {
      const selected = this.votes.get(`${token}:${poll.id}`) ?? null;
      const total = [...this.votes.keys()].filter(key => key.endsWith(`:${poll.id}`)).length;
      return { ...poll, selectedOptionId: selected, totalVotes: selected ? total : null, options: poll.options.map(option => {
        const count = [...this.votes.values()].filter(value => value === option.id).length;
        return { ...option, votes: selected ? count : null, percentage: selected ? Math.round(1000 * count / total) / 10 : null };
      }) };
    }) };
  }
  admin(): FanAdmin { return { auctionCompleted: true, publicLiveViewEnabled: this.publicEnabled, polls: this.data.polls.map(poll => ({ category: poll.category, title: poll.title, enabled: this.enabled.has(poll.category), isOpen: poll.isOpen, optionCount: poll.options.length, voteCount: [...this.votes.keys()].filter(key => key.endsWith(`:${poll.id}`)).length })) }; }
  async setup(context: BrowserContext) {
    await context.route('**/api/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      if (path.endsWith('/auth/me')) return route.fulfill({ json: { id: 'owner', fullName: 'Owner' } });
      if (path.includes('/api/public/')) {
        if (this.unavailable) return route.fulfill({ status: 404, json: { detail: 'Fan Choice is unavailable for this tournament.' } });
        const token = req.headers()['x-fan-voter'] || '';
        if (req.method() === 'POST') {
          this.posts++;
          const poll = this.data.polls.find(p => path.includes(`/${p.id}/votes`))!;
          const option = req.postDataJSON().optionId;
          const existing = this.votes.get(`${token}:${poll.id}`);
          if (!poll.isOpen) return route.fulfill({ status: 409, json: { detail: 'Voting is closed for this category.' } });
          if (existing && existing !== option) return route.fulfill({ status: 409, json: { detail: 'Your vote is permanent and cannot be changed.' } });
          this.votes.set(`${token}:${poll.id}`, option);
          if (this.loseResponse) { this.loseResponse = false; await route.abort('failed'); this.notify(); return; }
          await route.fulfill({ json: this.page(token) }); this.notify(); return;
        }
        return route.fulfill({ json: this.page(token) });
      }
      if (path.includes('/fan-choice')) {
        if (req.method() === 'PUT') {
          const category = path.split('/').at(-1)!; const body = req.postDataJSON(); this.configWrites.push({ category, ...body });
          if (body.enabled) this.enabled.add(category); else this.enabled.delete(category);
          this.data.polls.find(p => p.category === category)!.isOpen = body.isOpen;
        }
        return route.fulfill({ json: this.admin() });
      }
      if (path.endsWith('/settings')) return route.fulfill({ json: { publicLiveViewEnabled: this.publicEnabled } });
      if (path.endsWith('/teams')) return route.fulfill({ json: [] });
      if (path.endsWith('/view-link')) return route.fulfill({ json: { path: '/registrations/fan-cup/view/demo' } });
      return route.fulfill({ json: { id: 'fan-cup', name: this.data.tournamentName, slug: 'fan-cup', season: '2026', status: 'COMPLETED', userRole: 'OWNER', createdAtUtc: '2026-11-24T00:00:00Z' } });
    });
    await context.route('**/hubs/auction/negotiate*', route => route.fulfill({ json: { negotiateVersion: 1, connectionId: 'test', connectionToken: 'test', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }] } }));
    await context.routeWebSocket('**/hubs/auction*', socket => {
      this.sockets.push(socket);
      socket.onClose(() => { this.sockets = this.sockets.filter(value => value !== socket); });
      socket.onMessage(message => { for (const part of String(message).split('\u001e').filter(Boolean)) {
        const frame = JSON.parse(part); if (frame.protocol) socket.send('{}\u001e');
        if (frame.type === 1 && frame.invocationId) { this.joins.push(frame.target); socket.send(JSON.stringify({ type: 3, invocationId: frame.invocationId }) + '\u001e'); }
      } });
    });
  }
}

test('mobile spectators cast permanent votes and see live percentages from another browser', async ({ context, page, browser }) => {
  const server = new FanServer(); await server.setup(context); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/live/fan-cup/fan-voting');
  await expect(page.getByRole('heading', { name: /Back your/ })).toBeVisible();
  await page.getByRole('button', { name: 'Switch Fan Choice to night mode' }).click();
  await expect(page.getByRole('navigation', { name: 'Fan Choice categories' }).getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({ path: '../.cache/fan-choice-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Select Arjun Menon', exact: true }).click();
  await page.getByRole('button', { name: 'Review vote' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lock your pick.' }); await expect(dialog).toContainText('permanent');
  await page.screenshot({ path: '../.cache/fan-choice-vote-confirmation.png' });
  await dialog.getByRole('button', { name: 'Go back' }).click(); expect(server.posts).toBe(0);
  await page.getByRole('button', { name: 'Review vote' }).click(); await dialog.getByRole('button', { name: 'Confirm permanent vote' }).click();
  await expect(dialog).toHaveCount(0); await expect(page.locator('.fan-voted-banner')).toContainText('Arjun Menon');
  await expect(page.getByTestId('fan-option-BEST_BUY-0')).toContainText('100.0%');
  await expect(page.getByRole('button', { name: 'Review vote' })).toHaveCount(0);
  const second = await browser.newContext({ baseURL: 'http://localhost:5174' }); await server.setup(second);
  try {
    const other = await second.newPage(); await other.goto('/live/fan-cup/fan-voting');
    await expect(other.getByRole('progressbar')).toHaveCount(0);
    await other.getByRole('button', { name: 'Select Rohan Nair', exact: true }).click(); await other.getByRole('button', { name: 'Review vote' }).click();
    await other.getByRole('button', { name: 'Confirm permanent vote' }).click();
    await expect(page.getByTestId('fan-option-BEST_BUY-0')).toContainText('50.0%');
    await expect(page.getByTestId('fan-option-BEST_BUY-1')).toContainText('50.0%');
    await expect(page.locator('.fan-total')).toContainText('2');
    await page.reload(); await expect(page.locator('.fan-voted-banner')).toContainText('Arjun Menon');
    await expect(page.getByTestId('fan-option-BEST_BUY-0')).toContainText('50.0%');
    expect(server.joins).toContain('JoinFanChoice'); expect(server.votes.size).toBe(2);
    await page.screenshot({ path: '../.cache/fan-choice-live-results-mobile.png', fullPage: true });
  } finally { await second.close(); }
});

test('all categories work on small phones and full squads include multiple icons', async ({ context, page }) => {
  const server = new FanServer(); await server.setup(context); await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/live/fan-cup/fan-voting'); await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  for (const poll of server.data.polls) {
    await page.getByRole('navigation', { name: 'Fan Choice categories' }).getByRole('button', { name: new RegExp(poll.title) }).click();
    if (poll.category === 'STRONGEST_SQUAD') {
      const card = page.getByTestId(`fan-option-${poll.id}-0`); await card.getByText('Meet the squad').click();
      await expect(card.getByRole('listitem')).toHaveCount(3); await expect(card).toContainText('Nikhil Varma'); await expect(card.getByText('Icon player', { exact: true })).toHaveCount(2);
    }
    await page.getByRole('searchbox').fill(poll.options[0].name); await expect(page.locator('.fan-option')).toHaveCount(1);
    await page.getByRole('button', { name: `Select ${poll.options[0].name}`, exact: true }).click(); await page.getByRole('button', { name: 'Review vote' }).click();
    const dialog = page.getByRole('dialog'); expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: 'Confirm permanent vote' }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.locator('.fan-voted-banner')).toBeVisible();
    for (const percentage of await page.locator('.fan-result-detail').all()) {
      const sizes = await percentage.evaluate(el => ({ available: el.clientWidth, actual: el.scrollWidth, text: el.textContent, font: getComputedStyle(el.querySelector('strong')!).font, grid: getComputedStyle(el.parentElement!).gridTemplateColumns }));
      expect(sizes.actual, JSON.stringify(sizes)).toBeLessThanOrEqual(sizes.available + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await expect(page.getByText('5/5 voted', { exact: true })).toBeVisible(); expect(server.votes.size).toBe(5);
  await page.screenshot({ path: '../.cache/fan-choice-small-phone-light.png', fullPage: true });
});

test('Fan Choice has an independent persistent appearance and responsive ballot rail', async ({ context, page }) => {
  const server = new FanServer(); await server.setup(context); await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/live/fan-cup/fan-voting'); const fan = page.locator('.fan-choice-page');
  await expect(fan).toHaveAttribute('data-fan-theme', 'paper');
  const appTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.getByRole('button', { name: 'Switch Fan Choice to night mode' }).click();
  await expect(fan).toHaveAttribute('data-fan-theme', 'night');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(appTheme);
  await page.reload(); await expect(fan).toHaveAttribute('data-fan-theme', 'night');
  await page.getByRole('button', { name: 'Switch Fan Choice to paper mode' }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const nav = page.getByRole('navigation', { name: 'Fan Choice categories' });
    await nav.getByRole('button', { name: 'Best Icon Pick', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Best Icon Pick.' })).toBeVisible();
    await nav.getByRole('button', { name: 'Best Auction Buy', exact: true }).click();
    if (width === 390 || width === 1440) await page.screenshot({ path: `../.cache/fan-choice-paper-${width}.png`, fullPage: true });
  }
});

test('a lost confirmation response recovers the saved vote instead of asking for a second vote', async ({ context, page }) => {
  const server = new FanServer(); server.loseResponse = true; await server.setup(context);
  await page.goto('/live/fan-cup/fan-voting'); await page.getByRole('button', { name: 'Select Arjun Menon', exact: true }).click();
  await page.getByRole('button', { name: 'Review vote' }).click(); await page.getByRole('button', { name: 'Confirm permanent vote' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.locator('.fan-voted-banner')).toContainText('Arjun Menon');
  await page.reload(); await expect(page.getByTestId('fan-option-BEST_BUY-0')).toContainText('100.0%'); expect(server.posts).toBe(1);
});

test('closing during confirmation prevents a vote and unavailable pages hide cached results', async ({ context, page }) => {
  const server = new FanServer(); await server.setup(context); await page.goto('/live/fan-cup/fan-voting');
  await page.getByRole('button', { name: 'Select Arjun Menon', exact: true }).click(); await page.getByRole('button', { name: 'Review vote' }).click();
  server.data.polls[0].isOpen = false; await page.getByRole('button', { name: 'Confirm permanent vote' }).click();
  await expect(page.getByRole('dialog').getByRole('alert').first()).toContainText('closed'); expect(server.votes.size).toBe(0);
  await page.getByRole('button', { name: 'Go back' }).click(); await expect(page.getByText('Voting closed', { exact: true })).toBeVisible();
  server.unavailable = true; server.notify(); await expect(page.getByRole('heading', { name: 'Fan Choice unavailable' })).toBeVisible();
  await expect(page.locator('.fan-option')).toHaveCount(0);
});

test('browser storage is required before committing a permanent anonymous vote', async ({ context, page }) => {
  const server = new FanServer(); await server.setup(context);
  await context.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.includes('fan-choice:')) throw new Error('Storage disabled'); return original.call(this, key, value); }; });
  await page.goto('/live/fan-cup/fan-voting'); await page.getByRole('button', { name: 'Select Arjun Menon', exact: true }).click();
  await page.getByRole('button', { name: 'Review vote' }).click(); await page.getByRole('button', { name: 'Confirm permanent vote' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Enable browser storage'); expect(server.posts).toBe(0);
});

test('organisers manually open close and share voting while keeping participation counts', async ({ context, page }) => {
  const server = new FanServer(); server.enabled.clear(); server.data.polls.forEach(p => p.isOpen = false); await server.setup(context);
  await context.addInitScript(() => localStorage.setItem('auth_token', 'test-token')); await page.goto('/tournaments/fan-cup');
  const panel = page.getByRole('region', { name: 'Fan Choice', exact: true });
  await expect(panel.getByRole('button', { name: 'Open Best Auction Buy', exact: true })).toBeDisabled();
  await panel.getByRole('checkbox', { name: 'Enable Best Auction Buy', exact: true }).check();
  await panel.getByRole('button', { name: 'Open Best Auction Buy', exact: true }).click();
  server.votes.set('spectator:BEST_BUY', 'BEST_BUY-0');
  await panel.getByRole('button', { name: 'Close Best Auction Buy', exact: true }).click();
  await expect(panel).toContainText('1 vote'); await expect(panel.getByRole('button', { name: 'Open Best Auction Buy', exact: true })).toBeEnabled();
  await expect(panel.getByRole('link', { name: 'Preview voting page' })).toHaveAttribute('href', '/live/fan-cup/fan-voting');
  expect(server.configWrites.map(w => w.isOpen)).toEqual([false, true, false]); expect(server.votes.size).toBe(1);
});
