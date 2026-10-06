import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Trophy, Shield, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAuctionSocket } from './useAuctionSocket';
import { ConnectionIndicator } from './ConnectionIndicator';
import type { AuctionResults, ResultPlayer, TeamStatistics } from './resultsTypes';
import './results.css';
import './team-dashboard.css';
import { AuctionRecapLinks } from './AuctionRecapLinks';

const API = import.meta.env.VITE_API_BASE_URL || '';
const percentage = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

function CopyLink({ path, label }: { path: string; label: string }) {
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState(false);
  const url = new URL(path, window.location.origin).href;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Link copied'); }
    catch { setFallback(true); setMessage('Select and copy this link'); }
  };
  return <div className="result-copy"><button onClick={copy}>{label}</button>{message && <span aria-live="polite">{message}</span>}
    {fallback && <input aria-label={label} readOnly value={url} onFocus={event => event.target.select()} />}</div>;
}

function Portrait({ name, photo, className = '' }: { name: string; photo?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return <div className={`result-portrait ${className}`}>{photo && !failed
    ? <img src={photo} alt={name} onError={() => setFailed(true)} />
    : <><UserRound aria-hidden="true" /><span>{name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span></>}</div>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <div className="result-metric"><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

function TeamMark({ name, logo, color }: { name: string; logo?: string | null; color?: string }) {
  const [failed, setFailed] = useState(false);
  return logo && !failed ? <img src={logo} alt={`${name} logo`} onError={() => setFailed(true)} /> : <Shield aria-hidden="true" style={{ color: color || '#b7f76b' }} />;
}

function MoneyChart({ title, rows, money, color = '#b7f76b', counts = false }: {
  title: string; rows: { name: string; value: number }[]; money: (value: number) => string; color?: string; counts?: boolean;
}) {
  return <section className="result-panel" aria-label={title}><h2>{title}</h2>{rows.length ? <>
    <div className="result-chart"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ left: 5, right: 25 }} accessibilityLayer>
        <CartesianGrid stroke="#26334a" horizontal={false} /><XAxis type="number" stroke="#94a3b8" tickFormatter={value => counts ? String(value) : value >= 1000 ? `${value / 1000}k` : String(value)} allowDecimals={!counts} />
        <YAxis type="category" dataKey="name" width={105} stroke="#cbd5e1" tick={{ fontSize: 11 }} tickFormatter={value => String(value).slice(0, 17)} />
        <Tooltip contentStyle={{ background: '#101a2d', border: '1px solid #425374', borderRadius: 12, color: '#fff' }} formatter={value => [counts ? Number(value) : money(Number(value)), counts ? 'Players sold' : 'Amount']} />
        <Bar dataKey="value" fill={color} radius={[0, 5, 5, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer></div>
    <details><summary>View chart values</summary><ul>{rows.map((row, index) => <li key={`${row.name}-${index}`}>{row.name}: {counts ? row.value : money(row.value)}</li>)}</ul></details>
  </> : <p className="result-muted">No sales recorded yet.</p>}</section>;
}

function PlayersTable({ players, money, title = 'Player results', showFilters = true }: {
  players: ResultPlayer[]; money: (value: number) => string; title?: string; showFilters?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [position, setPosition] = useState('ALL');
  const [sort, setSort] = useState('PRICE');
  const positions = [...new Set(players.map(player => player.position || 'Unspecified'))].sort();
  const visible = players.filter(player => {
    const statusMatches = status === 'ALL' || player.status === status ||
      (status === 'AVAILABLE' && ['AVAILABLE', 'ON_AUCTION', 'UNSOLD'].includes(player.status)) ||
      (status === 'UNSOLD' && player.status === 'FINAL_UNSOLD');
    return statusMatches && (position === 'ALL' || (player.position || 'Unspecified') === position) &&
      `${player.playerName} ${player.playerSetName} ${player.winningTeamName ?? ''}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => sort === 'PRICE' ? (b.finalPrice ?? -1) - (a.finalPrice ?? -1) || a.playerName.localeCompare(b.playerName) : a.playerName.localeCompare(b.playerName));
  return <section className="result-panel"><h2>{title}</h2>
    {showFilters && <div className="result-filters">
      <input aria-label="Search players" placeholder="Search player, set or team" value={search} onChange={event => setSearch(event.target.value)} />
      <select aria-label="Player status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All players</option><option value="AVAILABLE">Available / eligible</option><option value="SOLD">Sold</option><option value="UNSOLD">Unsold</option></select>
      <select aria-label="Player position" value={position} onChange={event => setPosition(event.target.value)}><option value="ALL">All positions</option>{positions.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Sort players" value={sort} onChange={event => setSort(event.target.value)}><option value="PRICE">Highest sale first</option><option value="NAME">Name A–Z</option></select>
    </div>}
    {status === 'AVAILABLE' && <p className="result-muted">Includes players awaiting a first attempt, the active player, and players eligible for another unsold round.</p>}
    <div className="result-table-wrap"><table><thead><tr><th>Player</th><th>Set / Position</th><th>Status / Attempts</th><th>Base price</th><th>Winning team</th><th>Sale price</th></tr></thead><tbody>
      {visible.map(player => <tr key={player.playerId} data-testid={`result-player-${player.playerId}`}>
        <td data-label="Player"><div className="result-player-cell"><Portrait key={`${player.playerId}:${player.photoUrl}`} name={player.playerName} photo={player.photoUrl} /><div><strong>{player.playerName}</strong><small>{player.jerseyNumber == null ? '' : `#${player.jerseyNumber} · `}{player.age == null ? '' : `Age ${player.age} · `}{player.preferredFoot || 'Foot unspecified'}</small></div></div></td>
        <td data-label="Set / Position">{player.playerSetName}<small>{player.position || 'Unspecified'}</small></td>
        <td data-label="Status / Attempts"><span className={`result-badge ${player.status === 'SOLD' ? 'sold' : ''}`}>{player.status.replaceAll('_', ' ')}</span><small>{player.attemptCount} {player.attemptCount === 1 ? 'attempt' : 'attempts'}</small></td>
        <td data-label="Base price">{money(player.basePrice)}</td><td data-label="Winning team">{player.winningTeamName ?? '—'}</td><td data-label="Sale price" className="result-price">{player.finalPrice == null ? '—' : money(player.finalPrice)}</td>
      </tr>)}
    </tbody></table></div>
    {!visible.length && <p className="result-muted">No players match this view.</p>}
  </section>;
}

function UpcomingPlayers({ data, money }: { data: AuctionResults; money: (value: number) => string }) {
  const { state, players, statistics } = data;
  const activeId = !state.isUnsoldRound ? state.currentSetSummary?.setId : null;
  const waiting = state.sessionStatus === 'COMPLETED' ? [] : players.filter(player =>
    player.status === 'AVAILABLE' || (state.isUnsoldRound && player.status === 'UNSOLD' && player.attemptCount < state.currentAttemptNumber));
  const retry = state.sessionStatus === 'COMPLETED' ? [] : players.filter(player => player.status === 'UNSOLD' &&
    (!state.isUnsoldRound || player.attemptCount >= state.currentAttemptNumber));
  const sets = [...statistics.sets].sort((a, b) => a.sortOrder - b.sortOrder || a.setId.localeCompare(b.setId));
  const groups = sets.filter(set => set.setId === activeId || waiting.some(player => player.playerSetId === set.setId));
  const nextId = groups.find(set => set.setId !== activeId)?.setId;
  const cards = (list: ResultPlayer[]) => <ul className="upcoming-player-grid">{[...list].sort((a, b) => a.playerName.localeCompare(b.playerName)).map(player =>
    <li key={player.playerId} data-testid={`upcoming-player-${player.playerId}`}><Portrait name={player.playerName} photo={player.photoUrl} /><div><strong>{player.playerName}</strong><small>{player.jerseyNumber == null ? '' : `#${player.jerseyNumber} · `}{player.position || 'Player'}</small><span>Base price <b>{money(player.basePrice)}</b></span></div></li>)}</ul>;
  return <section className="result-panel result-upcoming" aria-labelledby="upcoming-title">
    <div className="upcoming-heading"><div><p className="result-eyebrow">Still to take the stage</p><h2 id="upcoming-title">Upcoming players</h2></div><span className="result-badge">{waiting.length} waiting</span></div>
    <p className="result-muted">Browse the remaining players by set. Names are listed alphabetically; the auction draw order may differ.</p>
    {state.currentLot && <div className="upcoming-on-stage"><span className="result-badge sold">Now on the podium</span><strong>{state.currentLot.playerName}</strong><small>{state.currentLot.playerSetName}</small></div>}
    <div className="upcoming-set-list">{groups.map(set => {
      const list = waiting.filter(player => player.playerSetId === set.setId);
      const active = set.setId === activeId;
      return <details key={set.setId} open={active || set.setId === nextId} className={`upcoming-set${active ? ' upcoming-active-set' : ''}`} data-testid={`upcoming-set-${set.setId}`}>
        <summary><div><span>{active ? 'Current active set' : state.isUnsoldRound ? 'This unsold round' : set.setId === nextId ? 'Next set' : 'Upcoming set'}</span><h3>{set.setName}</h3></div><span className="upcoming-count">{list.length} pending <ArrowUpRight size={16} /></span></summary>
        {list.length ? cards(list) : <p className="result-muted">{state.currentLot ? 'The remaining player is on the podium.' : 'All players in this set have been auctioned.'}</p>}
      </details>;
    })}</div>
    {retry.length > 0 && <div className="upcoming-retry" data-testid="upcoming-retry-pool"><h3>{state.isUnsoldRound ? 'Next unsold round' : 'Returning for the unsold round'}</h3><p className="result-muted">{retry.length} {retry.length === 1 ? 'player is' : 'players are'} waiting for another auction attempt.</p>{sets.filter(set => retry.some(player => player.playerSetId === set.setId)).map(set => <details className="upcoming-set" key={set.setId}><summary><h3>{set.setName}</h3><span className="upcoming-count">{retry.filter(player => player.playerSetId === set.setId).length} players <ArrowUpRight size={16} /></span></summary>{cards(retry.filter(player => player.playerSetId === set.setId))}</details>)}</div>}
    {!waiting.length && !retry.length && !activeId && <p className="result-muted">{state.sessionStatus === 'COMPLETED' ? "Every player's auction outcome has been recorded." : state.currentLot ? 'The final player is on the podium.' : 'No players are waiting to be revealed.'}</p>}
  </section>;
}

function TeamSquad({ team, data, publicView, money }: { team: TeamStatistics; data: AuctionResults; publicView: boolean; money: (value: number) => string }) {
  const standing = team.standing;
  const roster = data.players.filter(player => player.status === 'SOLD' && player.winningTeamId === standing.teamId);
  const { state, statistics } = data;
  const minimumNeeded = Math.max(0, standing.minimumSquadSize - standing.currentSquadSize);
  const openSlots = Math.max(0, standing.maximumSquadSize - standing.currentSquadSize);
  const pursePercent = standing.initialPurse > 0 ? Math.max(0, Math.min(100, standing.remainingPurse / standing.initialPurse * 100)) : 0;
  const remaining = state.sessionStatus === 'COMPLETED' ? [] : data.players.filter(player => ['AVAILABLE', 'ON_AUCTION', 'UNSOLD'].includes(player.status));
  const lot = state.currentLot || state.lastResult;
  const leader = state.teamStandings.find(item => item.teamId === (state.currentLot ? lot?.leadingTeamId : lot?.winningTeamId));
  const accent = /^#[0-9a-f]{6}$/i.test(standing.primaryColor) ? standing.primaryColor : '#c4f143';
  return <div className="result-stack franchise-dashboard" style={{ '--franchise-accent': accent } as React.CSSProperties}>
    <section className="franchise-identity">
      <div className="franchise-crest"><TeamMark key={standing.logoUrl} name={standing.teamName} logo={standing.logoUrl} color={accent} /></div>
      <div className="franchise-identity-copy"><p className="result-eyebrow">{state.tournamentName} / Franchise headquarters</p><h2>{standing.teamName}</h2><p>{standing.shortName} · {state.currentSetName || 'Tournament auction'} · <span className="result-badge">{state.sessionStatus}</span></p></div>
      <div className="franchise-identity-share">{data.publicLiveViewEnabled && <CopyLink label="Copy Franchise Link" path={`/live/${encodeURIComponent(state.slug)}/teams/${standing.teamId}`} />}</div>
    </section>
    <div className="franchise-summary-grid">
      <section className="franchise-budget"><p className="result-eyebrow">Your remaining purse</p><strong data-testid="franchise-purse">{money(standing.remainingPurse)}</strong><div className="franchise-bar"><span style={{ width: `${pursePercent}%` }} /></div><div className="franchise-budget-details"><span><small>Starting purse</small><b>{money(standing.initialPurse)}</b></span><span><small>Total invested</small><b>{money(standing.totalSpent)}</b></span></div><p>{pursePercent.toFixed(1)}% of the starting purse remains.</p></section>
      <section className="franchise-capacity"><p className="result-eyebrow">Building the squad</p><div className="franchise-squad-number"><strong>{standing.currentSquadSize}</strong><span>signed players<br />of {standing.maximumSquadSize} maximum</span></div><progress max={Math.max(1, standing.maximumSquadSize)} value={standing.currentSquadSize} aria-label="Team squad capacity" /><div className="franchise-slot-counts"><span><b data-testid="franchise-minimum-slots">{minimumNeeded}</b>needed for minimum</span><span><b data-testid="franchise-open-slots">{openSlots}</b>open squad slots</span></div><p>{!openSlots ? 'Squad full. No further signings available.' : !minimumNeeded ? 'Minimum squad reached. You can strengthen your squad.' : `Sign ${minimumNeeded} more ${minimumNeeded === 1 ? 'player' : 'players'} to reach the minimum of ${standing.minimumSquadSize}.`}</p></section>
    </div>
    <section className="franchise-auction-context"><div><p className="result-eyebrow">Across the auction</p><h3>{statistics.soldPlayers} signed · {statistics.totalPlayers} registered</h3><p>{state.sessionStatus === 'COMPLETED' ? 'Final outcomes are recorded below.' : `${remaining.length} players remain in the pool, including the active lot and players awaiting another attempt.`}</p></div><div><small>Maximum allowed bid</small><strong>{money(standing.maximumAllowedBid)}</strong><p>{standing.canBid ? 'The auctioneer validates each purchase against purse and squad rules.' : 'This team cannot bid on the current lot.'}</p></div></section>
    <div className="franchise-detail-grid">
      <section className="franchise-podium"><p className="result-eyebrow">{state.currentLot ? 'Live on the podium' : lot ? 'Latest auction result' : 'The auction floor'}</p>{lot ? <><div className="franchise-podium-player"><Portrait key={`${lot.playerId}:${lot.photoUrl}`} name={lot.playerName} photo={lot.photoUrl} /><div><h3>{lot.playerName}</h3><p>{lot.position || 'Player'} · {lot.playerSetName}</p></div></div><div className="franchise-live-price"><span>{state.currentLot ? lot.currentBid == null ? 'Bidding opens at' : 'Leading bid' : lot.status === 'SOLD' ? 'Sold for' : 'Unsold · Base price'}</span><strong>{money(state.currentLot ? lot.currentBid ?? lot.basePrice : lot.finalPrice ?? lot.basePrice)}</strong></div><p className={leader?.teamId === standing.teamId ? 'franchise-leading' : ''}>{leader ? `${leader.teamName}${leader.teamId === standing.teamId ? ' · Your franchise' : ''}` : state.currentLot ? 'Waiting for the opening bid' : 'No winning team'}</p></> : <><h3>{state.sessionStatus === 'COMPLETED' ? 'Auction complete.' : 'Ready for the next reveal.'}</h3><p>The player and leading bid appear here as the auction unfolds.</p></>}</section>
      <section className="franchise-record"><p className="result-eyebrow">Your marquee signing</p>{team.mostExpensiveSigning ? <><div className="franchise-podium-player"><Portrait key={team.mostExpensiveSigning.photoUrl} name={team.mostExpensiveSigning.playerName} photo={team.mostExpensiveSigning.photoUrl} /><div><h3>{team.mostExpensiveSigning.playerName}</h3><p>{team.mostExpensiveSigning.position || 'Player'}</p></div></div><strong>{money(team.mostExpensiveSigning.finalPrice ?? 0)}</strong><p>Average signing cost: {money(team.averagePlayerCost)}</p></> : <><h3>Your first star awaits.</h3><p>Your highest-value signing will take this spot.</p></>}</section>
    </div>
    <section className="result-panel franchise-signings"><div className="franchise-section-heading"><div><p className="result-eyebrow">The players wearing your colours</p><h2>Your signed squad</h2></div><span className="result-badge">{roster.length} signed</span></div><div className="franchise-roster-grid">{roster.map(player => <article key={player.playerId} data-testid={`franchise-signing-${player.playerId}`}><Portrait key={player.photoUrl} name={player.playerName} photo={player.photoUrl} /><div><h3>{player.playerName}</h3><p>{player.position || 'Player'} · {player.playerSetName}</p><small>Base {money(player.basePrice)}</small></div><strong>{money(player.finalPrice ?? 0)}</strong></article>)}</div>{!roster.length && <p className="result-muted">No signings yet. Every player bought by this team will appear here.</p>}</section>
    {team.positions.length > 0 && <div className="result-position-strip">{team.positions.map(position => <span key={position.position}>{position.position} · {position.playerCount} players · {money(position.totalSpent)}</span>)}</div>}
    {state.sessionStatus !== 'COMPLETED' ? <><UpcomingPlayers data={data} money={money} /><PlayersTable players={remaining} money={money} title="Remaining player pool" /><p className="result-muted">Base prices are starting prices. A visible purse balance does not guarantee a player can be bought; the auctioneer checks all reserve and squad rules.</p></> : <section className="result-panel"><h2>The auction is complete</h2><p className="result-muted">{statistics.unsoldPlayers} players finished unsold. Your squad and purse above reflect the final recorded results.</p><Link to={publicView ? `/live/${encodeURIComponent(state.slug)}/recap` : `/tournaments/${state.tournamentId}/recap`}>Explore the auction recap <ArrowUpRight size={16} /></Link></section>}
    {!publicView && !data.publicLiveViewEnabled && <p className="result-muted">Public sharing is disabled in tournament settings.</p>}
  </div>;
}

export function AuctionResultsPage({ publicView = false }: { publicView?: boolean }) {
  const { id, slug, teamId } = useParams();
  const { token } = useAuth();
  const [params] = useSearchParams();
  const key = publicView ? slug : id;
  const query = useQuery({
    queryKey: ['auction-results', publicView, key, publicView ? null : token], enabled: !!key && (publicView || !!token),
    queryFn: async () => {
      const response = await fetch(`${API}/api/${publicView ? `public/tournaments/${key}` : `tournaments/${key}`}/results`,
        { headers: publicView ? {} : { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json()).detail || 'Auction results are unavailable.');
      return await response.json() as AuctionResults;
    },
  });
  const { refetch } = query;
  const synchronize = useCallback(async () => { await refetch({ throwOnError: true }); }, [refetch]);
  const connection = useAuctionSocket(query.data?.state.tournamentId, publicView ? null : token, synchronize);
  if (!query.data) return <main className="auction-results result-loading"><Trophy /><h1>{query.isPending ? 'Loading the auction…' : 'Auction unavailable'}</h1>
    <p>{query.error?.message}</p>{query.isError && <button onClick={() => refetch()}>Retry</button>}</main>;
  // Never keep displaying cached public data after the organizer disables public access.
  if (publicView && query.isError) return <main className="auction-results result-loading"><h1>Live view unavailable</h1><p role="alert">{query.error.message}</p><button onClick={() => refetch()}>Retry</button></main>;
  const data = query.data;
  const { state, statistics: stats } = data;
  const money = (value: number) => `${state.currencySymbol}${value.toLocaleString(state.currencyCode === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 })}`;
  const base = publicView ? `/live/${state.slug}` : `/tournaments/${state.tournamentId}/results`;
  const rawView = params.get('view');
  const view = teamId ? 'teams' : rawView && ['overview', 'teams', 'players', 'results'].includes(rawView) ? rawView : publicView ? 'overview' : 'results';
  const team = stats.teams.find(item => item.standing.teamId === teamId);
  const teamUrl = (value: string) => publicView ? `/live/${state.slug}/teams/${value}` : `/tournaments/${state.tournamentId}/teams/${value}/squad`;
  const bestSet = stats.sets.find(set => set.setId === stats.bestSellingSetId);
  const highlightTeam = (value: string | null) => stats.teams.find(item => item.standing.teamId === value);
  const biggest = highlightTeam(stats.biggestSpenderTeamId);
  const largest = highlightTeam(stats.largestRemainingPurseTeamId);
  const lot = state.currentLot || state.lastResult;
  const leader = state.teamStandings.find(standing => standing.teamId === (state.currentLot ? lot?.leadingTeamId : lot?.winningTeamId));
  return <main className="auction-results"><div className="result-shell result-stack">
    <header className="result-header"><div className="result-brand"><LeagueHammerBrand compact /><div><p className="result-eyebrow">{publicView ? 'Public auction portal' : 'Tournament results'}</p><h1>{state.tournamentName}</h1></div></div><div className="result-header-actions"><span data-theme-slot /><ConnectionIndicator status={connection} /><span className="result-badge">{state.sessionStatus}</span>
      <Link to={`/tournaments/${state.tournamentId}/projector`} target="_blank" rel="noopener noreferrer">Projector <ArrowUpRight size={14} /></Link>
      {!publicView && <Link to={`/tournaments/${state.tournamentId}`}>Tournament workspace</Link>}</div></header>
    {query.isError && <p role="alert">{query.error?.message}</p>}
    {state.sessionStatus === 'COMPLETED' && <AuctionRecapLinks tournamentId={state.tournamentId} slug={state.slug} publicView={publicView} />}
    <nav aria-label="Auction views" className="result-nav">{['overview', 'teams', 'players', 'results'].map(tab => <Link key={tab} aria-current={view === tab ? 'page' : undefined} to={`${base}?view=${tab}`}>{tab === 'results' && state.sessionStatus === 'COMPLETED' ? 'Auction Wrapped' : tab[0].toUpperCase() + tab.slice(1)}</Link>)}</nav>
    {publicView && !teamId && <CopyLink path={base} label="Copy Live Link" />}
    {view === 'overview' && <>
      <section className="result-live-hero">{lot ? <><Portrait key={`${lot.playerId}:${lot.photoUrl}`} className="result-spotlight-photo" name={lot.playerName} photo={lot.photoUrl} /><div><p className="result-eyebrow">{state.currentLot ? 'On the auction floor' : 'Latest result'} · {state.isUnsoldRound ? state.currentSetName || 'Unsold round' : state.currentSetName || lot.playerSetName}</p><h2 data-testid="portal-current-player">{lot.playerName}</h2><p>{lot.position || 'Player'} · {lot.age == null ? 'Age unspecified' : `Age ${lot.age}`} · {lot.preferredFoot || 'Foot unspecified'}{lot.jerseyNumber == null ? '' : ` · #${lot.jerseyNumber}`}</p><div className="result-live-price"><small>{state.currentLot ? 'Current bid' : lot.status}</small><strong data-testid="portal-current-price">{money(state.currentLot ? lot.currentBid ?? lot.basePrice : lot.finalPrice ?? lot.basePrice)}</strong></div><p>{leader?.teamName || (lot.status === 'UNSOLD' ? 'No winning team' : 'Awaiting a leading team')} · Base {money(lot.basePrice)}</p></div></>
        : <div><p className="result-eyebrow">{state.sessionStatus === 'COMPLETED' ? 'Auction complete' : 'Ready for kickoff'}</p><h2>The next star awaits</h2><p>Player details will appear when the auctioneer reveals the next lot.</p></div>}</section>
      <div className="result-metrics"><Metric label="Registered players" value={stats.totalPlayers} /><Metric label="Sold" value={stats.soldPlayers} detail={`${percentage(stats.salePercentage)} sold`} /><Metric label="Unsold" value={stats.unsoldPlayers} /><Metric label="Total spent" value={money(stats.totalSpent)} /></div>
      <section className="result-panel"><h2>Live franchises</h2><div className="result-team-grid">{stats.teams.map(item => <Link className="result-team-card" key={item.standing.teamId} to={teamUrl(item.standing.teamId)}><div className="result-team-title"><TeamMark key={item.standing.logoUrl} name={item.standing.teamName} logo={item.standing.logoUrl} color={item.standing.primaryColor} /><strong>{item.standing.teamName}</strong></div><span>{money(item.standing.remainingPurse)} remaining</span><small>{item.standing.currentSquadSize} / {item.standing.minimumSquadSize} minimum squad · {money(item.standing.totalSpent)} spent</small></Link>)}</div></section>
      <section className="result-panel"><h2>Recent sales</h2>{state.soldPlayers.slice(0, 5).map(player => <div className="result-recent" key={player.playerId}><strong>{player.playerName}</strong><span>{player.winningTeamName} · {money(player.finalPrice ?? 0)}</span></div>)}{!state.soldPlayers.length && <p className="result-muted">No players sold yet.</p>}</section>
    </>}
    {view === 'teams' && (teamId ? team ? <><Link to={`${base}?view=teams`}>← All franchises</Link><TeamSquad team={team} data={data} publicView={publicView} money={money} /></> : <section className="result-panel"><h2>Franchise not found</h2><p>This franchise does not belong to the tournament.</p><Link to={`${base}?view=teams`}>View tournament franchises</Link></section>
      : <section className="result-panel"><h2>Franchises & squads</h2><div className="result-team-grid">{stats.teams.map(item => <article className="result-team-card" key={item.standing.teamId}><div className="result-team-title"><TeamMark key={item.standing.logoUrl} name={item.standing.teamName} logo={item.standing.logoUrl} color={item.standing.primaryColor} /><h3>{item.standing.teamName}</h3></div><strong>{money(item.standing.remainingPurse)} remaining</strong><p>{item.standing.currentSquadSize} players · {money(item.standing.totalSpent)} spent</p><progress max={item.standing.minimumSquadSize} value={Math.min(item.standing.currentSquadSize, item.standing.minimumSquadSize)} aria-label={`${item.standing.teamName} minimum squad progress`} /><small>Minimum {item.standing.minimumSquadSize} · Maximum {item.standing.maximumSquadSize}</small><Link to={teamUrl(item.standing.teamId)}>View squad →</Link>{data.publicLiveViewEnabled && <CopyLink label={`Copy ${item.standing.shortName} Franchise Link`} path={`/live/${state.slug}/teams/${item.standing.teamId}`} />}</article>)}</div>{!stats.teams.length && <p className="result-muted">No franchises registered yet.</p>}</section>)}
    {view === 'players' && <>{publicView && <UpcomingPlayers data={data} money={money} />}<PlayersTable players={data.players} money={money} title="Player registry" /></>}
    {view === 'results' && <>
      <section className="result-wrapped-hero"><p className="result-eyebrow">{state.sessionStatus === 'COMPLETED' ? 'The auction is complete' : 'Live snapshot · Figures update as results are recorded'}</p><h2>{state.sessionStatus === 'COMPLETED' ? 'Auction Wrapped' : 'Auction results'}</h2><p>Every signing. Every squad. The story of {state.tournamentName}.</p>
        <div className="result-awards"><div><small>Most expensive player</small><h3>{stats.topPlayers[0]?.playerName ?? 'Awaiting a sale'}</h3><strong>{money(stats.highestSalePrice)}</strong><p>{stats.topPlayers[0]?.winningTeamName}</p></div><div><small>Biggest spender</small><h3>{biggest?.standing.teamName ?? '—'}</h3><strong>{money(biggest?.standing.totalSpent ?? 0)}</strong></div><div><small>Best selling set</small><h3>{bestSet?.setName ?? '—'}</h3><strong>{percentage(bestSet?.sellThroughPercentage ?? 0)}</strong></div></div>
      </section>
      <div className="result-metrics"><Metric label="Sold / registered" value={`${stats.soldPlayers} / ${stats.totalPlayers}`} detail={percentage(stats.salePercentage)} /><Metric label="Unsold" value={stats.unsoldPlayers} /><Metric label="Total spent" value={money(stats.totalSpent)} /><Metric label="Average sale" value={money(stats.averageSalePrice)} /><Metric label="Median sale" value={money(stats.medianSalePrice)} /><Metric label="Largest remaining purse" value={money(largest?.standing.remainingPurse ?? 0)} detail={largest?.standing.teamName} /><Metric label="Biggest price premium" value={money(stats.biggestPricePremium?.pricePremium ?? 0)} detail={stats.biggestPricePremium?.playerName} /><Metric label="Highest price multiplier" value={`${(stats.highestPriceMultiplier?.priceMultiplier ?? 0).toFixed(2)}×`} detail={stats.highestPriceMultiplier?.playerName} /></div>
      <div className="result-chart-grid"><MoneyChart title="Team spending" rows={stats.teams.map(item => ({ name: item.standing.teamName, value: item.standing.totalSpent }))} money={money} /><MoneyChart title="Remaining purses" rows={stats.teams.map(item => ({ name: item.standing.teamName, value: item.standing.remainingPurse }))} money={money} color="#69caff" /><MoneyChart title="Spending by position" rows={stats.positions.map(item => ({ name: item.position, value: item.totalSpent }))} money={money} color="#e9bc63" /><MoneyChart title="Sales by set" rows={stats.sets.map(item => ({ name: item.setName, value: item.soldCount }))} money={money} counts /><MoneyChart title="Top player prices" rows={stats.topPlayers.map(item => ({ name: item.playerName, value: item.finalPrice ?? 0 }))} money={money} color="#c4a4ff" /></div>
      <section className="result-panel"><h2>Team statistics</h2><p className="result-muted">Smallest spender: {highlightTeam(stats.smallestSpenderTeamId)?.standing.teamName ?? '—'} · Most players: {highlightTeam(stats.mostPlayersTeamId)?.standing.teamName ?? '—'}</p><div className="result-table-wrap"><table><thead><tr>{['Franchise', 'Squad', 'Spent', 'Remaining', 'Average cost', 'Record signing', 'Positions / Spend'].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{stats.teams.map(item => <tr key={item.standing.teamId}><td data-label="Franchise"><Link to={teamUrl(item.standing.teamId)}>{item.standing.teamName}</Link></td><td data-label="Squad">{item.standing.currentSquadSize}</td><td data-label="Spent">{money(item.standing.totalSpent)}</td><td data-label="Remaining">{money(item.standing.remainingPurse)}</td><td data-label="Average cost">{money(item.averagePlayerCost)}</td><td data-label="Record signing">{item.mostExpensiveSigning?.playerName ?? '—'}<small>{money(item.mostExpensiveSigning?.finalPrice ?? 0)}</small></td><td data-label="Positions / Spend">{item.positions.map(position => <small key={position.position}>{position.position}: {position.playerCount} · {money(position.totalSpent)}</small>)}</td></tr>)}</tbody></table></div></section>
      <section className="result-panel"><h2>Set statistics</h2><p className="result-muted">Counts reflect each player's latest outcome across both attempts.</p><div className="result-table-wrap"><table><thead><tr>{['Set', 'Players', 'Sold', 'Unsold', 'Spend', 'Average', 'Highest', 'Sell-through'].map(title => <th key={title}>{title}</th>)}</tr></thead><tbody>{stats.sets.map(set => <tr key={set.setId}><td data-label="Set">{set.setName}</td><td data-label="Players">{set.playerCount}</td><td data-label="Sold">{set.soldCount}</td><td data-label="Unsold">{set.unsoldCount}</td><td data-label="Spend">{money(set.totalSpent)}</td><td data-label="Average">{money(set.averageSalePrice)}</td><td data-label="Highest">{money(set.highestSalePrice)}</td><td data-label="Sell-through">{percentage(set.sellThroughPercentage)}</td></tr>)}</tbody></table></div></section>
      <section className="result-panel"><h2>Leading signings by position and set</h2><div className="result-rankings">{[...stats.mostExpensiveByPosition.map(player => ({ key: `position-${player.position}`, label: player.position || 'Unspecified', player })), ...stats.mostExpensiveBySet.map(player => ({ key: player.playerSetId, label: player.playerSetName, player }))].map(item => <article key={item.key}><small>{item.label}</small><strong>{item.player.playerName}</strong><span>{item.player.winningTeamName} · {money(item.player.finalPrice ?? 0)}</span></article>)}</div></section>
      <PlayersTable players={data.players} money={money} title="Full result table" />
    </>}
  </div></main>;
}
