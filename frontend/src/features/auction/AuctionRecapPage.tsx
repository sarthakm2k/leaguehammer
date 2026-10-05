import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useEffect, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUpRight, Check, Copy, Crown, MoveUpRight, Share2, Shirt, Sparkles, Trophy } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { AuctionResults, ResultPlayer } from './resultsTypes';
import './recap.css';

const API = import.meta.env.VITE_API_BASE_URL || '';

function PlayerPortrait({ player, large = false }: { player: ResultPlayer; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return <div className={`recap-portrait ${large ? 'recap-portrait-large' : ''}`}>
    <Shirt aria-hidden="true" /><span>{player.jerseyNumber != null ? `#${player.jerseyNumber}` : player.playerName.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>
    {player.photoUrl && !failed && <img src={player.photoUrl} alt={player.playerName} data-loaded={loaded} loading={large ? 'eager' : 'lazy'} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
  </div>;
}

export function AuctionRecapPage({ publicView = false }: { publicView?: boolean }) {
  const { id, slug } = useParams();
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState(false);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const key = publicView ? slug : id;
  const query = useQuery({
    queryKey: ['auction-results', publicView, key, publicView ? null : token], enabled: !!key && (publicView || !!token),
    queryFn: async () => {
      const response = await fetch(`${API}/api/${publicView ? `public/tournaments/${key}` : `tournaments/${key}`}/results`,
        { headers: publicView ? {} : { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json()).detail || 'This auction recap is unavailable.');
      return response.json() as Promise<AuctionResults>;
    },
  });
  const data = query.data;
  useEffect(() => {
    const previous = document.title;
    if (data) document.title = `${data.state.tournamentName} · Auction Recap`;
    return () => { document.title = previous; };
  }, [data]);
  if (!data || query.isError) return <main className="auction-recap recap-wait"><Trophy size={44} /><h1>{query.isError ? 'Recap unavailable' : 'Setting the stage…'}</h1><p>{query.error?.message || 'Your auction story is loading.'}</p>{query.isError && <button onClick={() => query.refetch()}>Try again</button>}</main>;
  const { state, statistics: stats } = data;
  const resultsUrl = publicView ? `/live/${encodeURIComponent(state.slug)}?view=results` : `/tournaments/${state.tournamentId}/results`;
  if (state.sessionStatus !== 'COMPLETED') return <main className="auction-recap recap-wait"><Sparkles size={44} /><p className="recap-kicker">The best is still to come</p><h1>Your recap is on its way.</h1><p>This page opens once the auction is complete.</p><Link to={resultsUrl}>Follow the auction <ArrowUpRight size={16} /></Link></main>;
  const money = (value: number) => `${state.currencySymbol}${value.toLocaleString(state.currencyCode === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`;
  const sold = data.players.filter(p => p.status === 'SOLD').sort((a, b) => (b.finalPrice ?? 0) - (a.finalPrice ?? 0) || a.playerName.localeCompare(b.playerName));
  const top = sold[0];
  const recordHolders = sold.filter(p => p.finalPrice === top?.finalPrice);
  const teams = [...stats.teams].sort((a, b) => b.standing.totalSpent - a.standing.totalSpent || a.standing.teamName.localeCompare(b.standing.teamName));
  const spendingLeaders = teams.filter(t => t.standing.totalSpent > 0 && t.standing.totalSpent === teams[0]?.standing.totalSpent);
  const comeback = sold.find(p => p.attemptCount > 1);
  const lift = stats.highestPriceMultiplier;
  const players = [...data.players].sort((a, b) => Number(b.status === 'SOLD') - Number(a.status === 'SOLD') || (b.finalPrice ?? 0) - (a.finalPrice ?? 0) || a.playerName.localeCompare(b.playerName))
    .filter(p => (teamFilter === 'ALL' || (teamFilter === 'UNSOLD' ? p.status !== 'SOLD' : p.winningTeamId === teamFilter)) &&
      `${p.playerName} ${p.position || ''} ${p.winningTeamName || ''}`.toLowerCase().includes(search.toLowerCase()));
  const shareUrl = new URL(`/live/${encodeURIComponent(state.slug)}/recap`, window.location.origin).href;
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setMessage('Recap link copied'); }
    catch { setFallback(true); setMessage('Select and copy the link below'); }
  };
  const share = async () => {
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: `${state.tournamentName} · Auction Recap`, text: 'The signings. The squads. The auction story.', url: shareUrl }); setMessage('Recap shared'); }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) await copy(); }
  };
  return <main className="auction-recap" id="recap-top">
    <div className="recap-topbar"><span className="recap-theme-slot" data-theme-slot /><a href="#recap-top" className="recap-wordmark"><LeagueHammerBrand compact /><span>AUCTION / RECAP</span></a>
      {data.publicLiveViewEnabled && <button aria-label="Share Recap" onClick={share}><Share2 size={17} /><span>Share</span></button>}</div>
    <div className="recap-shell">
      <header className="recap-hero">
        <div className="recap-hero-art" aria-hidden="true"><div className="recap-orbit" /><div className="recap-orbit recap-orbit-two" /><Sparkles /><span>FULL<br />TIME.</span></div>
        <p className="recap-kicker"><span className="recap-dot" />The final whistle. The full story.</p>
        <h1>BIG BIDS.<br /><span>BIGGER</span><br />MOMENTS.</h1>
        <p className="recap-tournament">{state.tournamentName}</p>
        <p className="recap-intro">Every name called. Every squad built. Your auction, all wrapped up.</p>
        <div className="recap-hero-actions"><a href="#recap-signings">Explore the signings <ArrowDown size={17} /></a>
          {data.publicLiveViewEnabled && <button onClick={copy}><Copy size={16} />Copy Recap Link</button>}</div>
        {message && <p role="status" className="recap-share-message"><Check size={15} />{message}</p>}
        {fallback && <input aria-label="Shareable recap link" className="recap-copy-input" readOnly value={shareUrl} onFocus={event => event.target.select()} />}
        {!data.publicLiveViewEnabled && <p className="recap-private-note">This recap is visible to tournament members. Public sharing is disabled.</p>}
        <div className="recap-scoreline"><div><strong>{stats.soldPlayers}<small>/{stats.totalPlayers}</small></strong><span>Players signed</span></div><div><strong>{teams.length}</strong><span>Franchises</span></div><div><strong>{Math.round(stats.salePercentage)}<small>%</small></strong><span>Sold at auction</span></div></div>
      </header>

      <section className="recap-section recap-headliner" aria-labelledby="recap-headliner-title">
        <div className="recap-chapter"><span>01 / THE HEADLINER</span><Crown size={20} /></div>
        {top ? <div className="recap-headliner-grid"><div className="recap-headliner-story"><p className="recap-kicker">{recordHolders.length > 1 ? 'Joint record signing' : 'The biggest bid of the auction'}</p><h2 id="recap-headliner-title">{top.playerName}</h2><p className="recap-headliner-team">{top.winningTeamName} <MoveUpRight size={20} /></p><div className="recap-record-price" data-testid="recap-record-price">{money(top.finalPrice ?? 0)}</div><div className="recap-detail-tags"><span>{top.position || 'Player'}</span><span>Base {money(top.basePrice)}</span>{top.priceMultiplier != null && <span>{top.priceMultiplier.toFixed(2)}× base price</span>}</div>{recordHolders.length > 1 && <p className="recap-tie">Also at this price: {recordHolders.slice(1).map(p => p.playerName).join(', ')}.</p>}</div><div className="recap-headliner-visual"><span className="recap-star-stamp">TOP<br />SIGNING</span><PlayerPortrait key={`${top.playerId}:${top.photoUrl}`} player={top} large /><span className="recap-photo-caption">A name to remember.</span></div></div>
          : <div className="recap-no-sale"><h2 id="recap-headliner-title">Every auction has its own story.</h2><p>No sales were recorded. Explore the player outcomes below.</p></div>}
      </section>

      <section className="recap-highlights" aria-label="Auction highlights"><article className="recap-total"><p className="recap-kicker">The money on the table</p><strong data-testid="recap-total-spent">{money(stats.totalSpent)}</strong><p>Total spent across all franchises</p><div><span>Average signing</span><b>{money(stats.averageSalePrice)}</b></div><div><span>Median signing</span><b>{money(stats.medianSalePrice)}</b></div></article>
        <article className="recap-lift"><MoveUpRight size={32} /><p className="recap-kicker">The biggest price lift</p><strong>{lift ? `${(lift.priceMultiplier ?? 0).toFixed(2)}×` : '—'}</strong><h3>{lift?.playerName || 'No sales recorded'}</h3><p>{lift ? `${money(lift.basePrice)} base → ${money(lift.finalPrice ?? 0)}` : 'A price story begins with a signing.'}</p></article>
        <article className="recap-comeback"><Sparkles size={30} /><p className="recap-kicker">{comeback ? 'The comeback signing' : 'The final tally'}</p><h3>{comeback?.playerName || `${stats.unsoldPlayers} unsold`}</h3><p>{comeback ? `Signed by ${comeback.winningTeamName} for ${money(comeback.finalPrice ?? 0)} after ${comeback.attemptCount} attempts.` : `${stats.soldPlayers} signed. ${stats.unsoldPlayers} unsold. Every outcome is part of the story.`}</p></article>
      </section>

      <section className="recap-section recap-franchises" aria-labelledby="recap-teams-title"><div className="recap-chapter"><span>02 / THE SQUADS</span><Shirt size={20} /></div><div className="recap-section-heading"><h2 id="recap-teams-title">Teams that<br /><em>made their move.</em></h2><p>{spendingLeaders.length ? `${spendingLeaders.map(t => t.standing.teamName).join(' & ')} ${spendingLeaders.length > 1 ? 'share the top spending spot' : 'led the spending'} with ${money(spendingLeaders[0].standing.totalSpent)}${spendingLeaders.length > 1 ? ' each' : ''}.` : 'No team spending was recorded.'}</p></div>
        <div className="recap-team-grid">{teams.map((team, index) => {
          const t = team.standing;
          const roster = sold.filter(p => p.winningTeamId === t.teamId);
          return <article className="recap-team" key={t.teamId} data-testid={`recap-team-${t.teamId}`} style={{ '--club-color': /^#[0-9a-f]{6}$/i.test(t.primaryColor || '') ? t.primaryColor : '#d6fd54' } as CSSProperties}>
            <div className="recap-team-top"><span className="recap-team-code">{t.shortName}</span><span className="recap-team-award">{spendingLeaders.some(item => item.standing.teamId === t.teamId) ? 'TOP SPENDER' : `FRANCHISE ${String(index + 1).padStart(2, '0')}`}</span></div><h3>{t.teamName}</h3><strong className="recap-team-spend">{money(t.totalSpent)}</strong><p className="recap-team-spend-caption">invested in {t.currentSquadSize} {t.currentSquadSize === 1 ? 'player' : 'players'}</p>
            <dl><div><dt>Purse remaining</dt><dd>{money(t.remainingPurse)}</dd></div><div><dt>Average signing</dt><dd>{money(team.averagePlayerCost)}</dd></div></dl>
            {team.mostExpensiveSigning && <div className="recap-team-record"><Crown size={15} /><div><small>Record signing</small><b>{team.mostExpensiveSigning.playerName}</b><span>{money(team.mostExpensiveSigning.finalPrice ?? 0)}</span></div></div>}
            <details><summary>Meet the squad <span>{roster.length} <ArrowDown size={14} /></span></summary><ul>{roster.map(p => <li key={p.playerId}><span>{p.playerName}<small>{p.position || 'Player'}</small></span><b>{money(p.finalPrice ?? 0)}</b></li>)}</ul>{!roster.length && <p className="recap-muted">No players signed.</p>}</details>
          </article>;
        })}</div>
      </section>

      <section className="recap-section recap-signings" id="recap-signings" aria-labelledby="recap-players-title"><div className="recap-chapter"><span>03 / EVERY PLAYER. EVERY OUTCOME.</span><Trophy size={20} /></div><div className="recap-section-heading"><h2 id="recap-players-title">The names.<br /><em>The numbers.</em></h2><p>Every player, ranked by sale price. Find your name, your team, or your next favourite signing.</p></div>
        <div className="recap-player-tools"><input aria-label="Find a player" placeholder="Find a player, position or team…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter recap by team" value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="ALL">All players</option>{teams.map(t => <option key={t.standing.teamId} value={t.standing.teamId}>{t.standing.teamName}</option>)}<option value="UNSOLD">Unsold players</option></select></div>
        <p className="recap-player-count" aria-live="polite">{players.length} {players.length === 1 ? 'player' : 'players'}{search || teamFilter !== 'ALL' ? ' matching your selection' : ' in the auction'}</p>
        <div className="recap-player-grid">{players.map(player => <article key={player.playerId} className={`recap-player ${player.status !== 'SOLD' ? 'recap-player-unsold' : ''}`} data-testid={`recap-player-${player.playerId}`}>
          <div className="recap-player-top"><PlayerPortrait key={`${player.playerId}:${player.photoUrl}`} player={player} /><div><span className="recap-player-position">{player.position || 'Player'}{player.jerseyNumber != null ? ` · #${player.jerseyNumber}` : ''}</span><h3>{player.playerName}</h3><p>{player.winningTeamName || 'No winning team'}</p></div></div>
          <div className="recap-player-price"><strong>{player.status === 'SOLD' ? money(player.finalPrice ?? 0) : 'Unsold'}</strong><span>{player.status === 'SOLD' && player.priceMultiplier != null ? `${player.priceMultiplier.toFixed(2)}× base` : `${player.attemptCount} ${player.attemptCount === 1 ? 'attempt' : 'attempts'}`}</span></div><div className="recap-player-meta"><span>Base {money(player.basePrice)}</span><span>{player.status === 'SOLD' && player.attemptCount > 1 ? `Comeback · ${player.attemptCount} attempts` : player.playerSetName}</span></div>
        </article>)}</div>
        {!players.length && <p className="recap-empty">No players match this selection. Try another name or team.</p>}
      </section>
      <footer className="recap-footer"><p className="recap-kicker">The squads are set.</p><h2>Next chapter?<br /><span>On the pitch.</span></h2><p>{state.tournamentName}</p><div>{data.publicLiveViewEnabled && <button onClick={share}>Share this recap <Share2 size={17} /></button>}<Link to={resultsUrl}>Full auction results <ArrowUpRight size={17} /></Link></div><small>Final auction figures · Each player counted once · Every signing remembered</small></footer>
    </div>
  </main>;
}
