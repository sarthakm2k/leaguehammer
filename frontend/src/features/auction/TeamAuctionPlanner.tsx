import { useState } from 'react';
import { Star, Search } from 'lucide-react';
import type { AuctionResults } from './resultsTypes';
import type { TeamAuctionStandingDto } from './auctionTypes';

type Target = { playerId: string; budget: number | null };

export function TeamAuctionPlanner({ data, standing, money }: { data: AuctionResults; standing: TeamAuctionStandingDto; money: (amount: number) => string }) {
  const storageKey = `leaguehammer:targets:${data.state.tournamentId}:${standing.teamId}`;
  const [targets, setTargets] = useState<Target[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) ? saved.filter((item): item is Target => item && typeof item.playerId === 'string' && (item.budget === null || Number.isSafeInteger(item.budget) && item.budget >= 0)) : [];
    } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('');
  const [setId, setSetId] = useState('');
  const [withinLimit, setWithinLimit] = useState(false);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [storageError, setStorageError] = useState('');
  const completed = data.state.sessionStatus === 'COMPLETED';
  const available = (status: string) => !completed && ['AVAILABLE', 'ON_AUCTION', 'UNSOLD'].includes(status);
  const slots = Math.max(0, standing.maximumSquadSize - standing.currentSquadSize);
  const minimumNeeded = Math.max(0, standing.minimumSquadSize - standing.currentSquadSize);
  const limit = Math.min(standing.remainingPurse, standing.maximumAllowedBid);
  const roster = data.players.filter(player => player.status === 'SOLD' && player.winningTeamId === standing.teamId);
  const positions = [...new Set(['Goalkeeper', 'Defender', 'Midfielder', 'Forward', ...data.players.map(player => player.position || 'Player')])];
  const sets = data.statistics.sets.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const targetMap = new Map(targets.map(target => [target.playerId, target]));
  const activeTargets = data.players.filter(player => targetMap.has(player.playerId) && available(player.status));
  const planned = activeTargets.reduce((sum, player) => sum + (targetMap.get(player.playerId)?.budget ?? player.basePrice), 0);
  const save = (next: Target[]) => {
    setTargets(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('Device storage is unavailable. Your plan will be lost when this page closes.'); }
  };
  const visible = data.players.filter(player => (onlyTargets ? targetMap.has(player.playerId) : available(player.status))
    && (!position || (player.position || 'Player') === position) && (!setId || player.playerSetId === setId)
    && player.playerName.toLowerCase().includes(search.toLowerCase())
    && (!withinLimit || available(player.status) && slots > 0 && player.basePrice <= limit))
    .sort((a, b) => Number(b.playerId === data.state.currentLot?.playerId) - Number(a.playerId === data.state.currentLot?.playerId) || a.playerName.localeCompare(b.playerName));

  return <section className="franchise-planner result-panel" aria-labelledby="team-plan-heading">
    <div className="franchise-section-heading"><h2 id="team-plan-heading">Plan your next moves</h2><span className="result-badge">{activeTargets.length} active targets</span></div>
    <div className="team-plan-metrics"><div><small>Budget per needed signing</small><strong>{minimumNeeded ? money(Math.floor(standing.remainingPurse / minimumNeeded)) : 'Minimum reached'}</strong></div><div><small>Target budgets</small><strong>{money(planned)}</strong></div><div><small>Unplanned purse</small><strong>{money(standing.remainingPurse - planned)}</strong></div></div>
    {(planned > standing.remainingPurse || activeTargets.length > slots) && <p role="alert" className="team-plan-warning">{planned > standing.remainingPurse ? 'Target budgets exceed your remaining purse. ' : ''}{activeTargets.length > slots ? 'You have more targets than open squad slots; keep some as alternatives.' : ''}</p>}
    <div className="team-plan-coverage" aria-label="Your squad by position">{positions.map(value => <span key={value}>{value}<b>{roster.filter(player => player.position === value).length}</b></span>)}</div>
    <p className="team-plan-note">Shortlists and budgets stay on this device; they are not shared with other link viewers. Planned amounts do not reserve money or place bids.</p>
    {storageError && <p role="status" className="team-plan-warning">{storageError}</p>}
    <div className="team-plan-filters"><label><Search size={14} /><input aria-label="Search target players" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a player" /></label><select aria-label="Filter targets by position" value={position} onChange={event => setPosition(event.target.value)}><option value="">All positions</option>{positions.map(value => <option key={value}>{value}</option>)}</select><select aria-label="Filter targets by set" value={setId} onChange={event => setSetId(event.target.value)}><option value="">All sets</option>{sets.map(set => <option key={set.setId} value={set.setId}>{set.setName}</option>)}</select></div>
    <div className="team-plan-switches"><button type="button" aria-pressed={onlyTargets} onClick={() => setOnlyTargets(!onlyTargets)}>My shortlist ({targets.length})</button><button type="button" aria-pressed={withinLimit} onClick={() => setWithinLimit(!withinLimit)}>Within bid limit</button></div>
    <p className="team-plan-note">Base prices only. The current team bid limit is {money(limit)}; the auctioneer still checks reserve and squad rules for every purchase. Names are alphabetical within the pool, with the live player first.</p>
    <div className="team-plan-list">{visible.map(player => {
      const target = targetMap.get(player.playerId);
      const live = player.playerId === data.state.currentLot?.playerId;
      return <article key={player.playerId} data-testid={`team-target-${player.playerId}`} className={live ? 'team-plan-live' : ''}>
        <button className="team-target-star" type="button" aria-label={`${target ? 'Remove' : 'Shortlist'} ${player.playerName}`} aria-pressed={!!target} onClick={() => save(target ? targets.filter(item => item.playerId !== player.playerId) : [...targets, { playerId: player.playerId, budget: player.basePrice }])}><Star size={18} fill={target ? 'currentColor' : 'none'} /></button>
        <div className="team-target-name"><strong>{player.playerName}</strong><small>{player.position || 'Player'} · {player.playerSetName}</small><span>{live ? 'ON THE PODIUM' : player.status === 'UNSOLD' ? 'Returning to auction' : player.status === 'SOLD' ? `Signed by ${player.winningTeamName || 'a team'}` : completed || player.status === 'FINAL_UNSOLD' ? 'Finished unsold' : 'Available'}</span></div>
        <div className="team-target-price"><small>Base</small><b>{money(player.basePrice)}</b>{target && available(player.status) && <label>My ceiling<input aria-label={`Target budget for ${player.playerName}`} type="number" min={0} step={1} value={target.budget ?? ''} onChange={event => {
          const budget = event.target.value === '' ? null : Number(event.target.value);
          if (budget !== null && (!Number.isSafeInteger(budget) || budget < 0)) return;
          save(targets.map(item => item.playerId === player.playerId ? { ...item, budget } : item));
        }} /></label>}</div>
        {target && available(player.status) && target.budget !== null && target.budget < player.basePrice && <p className="team-plan-warning">Your ceiling is below the base price.</p>}
        {live && target && (player.basePrice > (target.budget ?? player.basePrice) || (data.state.currentLot?.currentBid ?? player.basePrice) > (target.budget ?? player.basePrice)) && <p className="team-plan-warning">The live bid is above your planned ceiling.</p>}
      </article>;
    })}</div>
    {!visible.length && <p className="result-muted">{onlyTargets ? 'No shortlisted players match this view. Star a player in the pool to plan a signing.' : completed ? 'The auction is complete. You can review your saved shortlist.' : 'No remaining players match these filters.'}</p>}
  </section>;
}
