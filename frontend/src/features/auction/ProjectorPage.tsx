import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Gavel, Maximize, Minimize, Shield, Trophy, UserRound } from 'lucide-react';
import type { PublicAuctionLotDto, PublicAuctionStateDto } from './auctionTypes';
import { useAuctionSocket } from './useAuctionSocket';
import { ConnectionIndicator } from './ConnectionIndicator';
import { formatCurrency } from '../../utils/formatters';
import './projector.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function PlayerPortrait({ lot }: { lot: PublicAuctionLotDto }) {
  const [failed, setFailed] = useState(false);
  return <div className="stage-portrait">
    {lot.photoUrl && !failed
      ? <img src={lot.photoUrl} alt={lot.playerName} onError={() => setFailed(true)} />
      : <div className="stage-avatar"><UserRound aria-hidden="true" /><span>{lot.playerName.split(' ').map(n => n[0]).slice(0, 2).join('')}</span></div>}
    {lot.jerseyNumber != null && <span className="stage-jersey">#{lot.jerseyNumber}</span>}
    <span className="stage-photo-caption">{lot.position || 'Footballer'} · Round {lot.attemptNumber}</span>
  </div>;
}

export function ProjectorPage() {
  const { id, slug } = useParams<{ id: string; slug: string }>();
  const tournamentKey = id || slug;
  const [celebration, setCelebration] = useState<PublicAuctionLotDto | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['public-auction', tournamentKey],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/public/tournaments/${tournamentKey}/auction-state`);
      if (!response.ok) throw new Error((await response.json()).detail || 'Live auction is unavailable.');
      return await response.json() as PublicAuctionStateDto;
    },
    enabled: !!tournamentKey,
  });
  const { refetch } = query;
  const sync = useCallback(async () => { await refetch({ throwOnError: true }); }, [refetch]);
  const connection = useAuctionSocket(query.data?.tournamentId, null, sync, (event, args) => {
    if (event === 'PlayerSold') setCelebration(args[0] as PublicAuctionLotDto);
    if (event === 'PlayerRevealed' || event === 'ResultCorrected') setCelebration(null);
  });
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 4500);
    return () => clearTimeout(timer);
  }, [celebration]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      setScreenError(null);
    } catch { setScreenError('Use F11 to enter full screen in this browser.'); }
  };

  if (!query.data) return <div className="projector projector-loading">
    <Trophy size={52} /><h1>{query.isPending ? 'Preparing the stage…' : 'Live view unavailable'}</h1>
    <p>{query.error?.message || 'Connecting to the auction'}</p>
    {query.isError && <button onClick={() => { void query.refetch(); }}>Retry connection</button>}
  </div>;

  const state = query.data;
  const money = (amount: number) => formatCurrency(amount, state.currencyCode);
  const lot = state.currentLot || state.lastResult;
  const sold = !state.currentLot && lot?.status === 'SOLD';
  const unsold = !state.currentLot && lot?.status === 'UNSOLD';
  const leadingTeam = state.teamStandings.find(t => t.teamId === (sold ? lot?.winningTeamId : lot?.leadingTeamId));
  const rosterTeam = state.teamStandings.find(t => t.teamId === selectedTeamId) || state.teamStandings[0];
  const roster = state.soldPlayers.filter(p => p.winningTeamId === rosterTeam?.teamId);
  const progress = state.totalPlayersCount ? Math.round((state.totalSoldPlayersCount + state.totalUnsoldPlayersCount) / state.totalPlayersCount * 100) : 0;

  const teamColumns = state.teamStandings.length <= 4 ? 1 : state.teamStandings.length <= 12 ? 2 : state.teamStandings.length <= 24 ? 3 : 4;
  return <div className={`projector ${celebration ? 'stage-celebrating' : ''}`} data-team-columns={teamColumns} data-team-density={state.teamStandings.length > 2 ? 'compact' : 'regular'} style={{ '--team-color': leadingTeam?.primaryColor || '#b7f76b', '--team-cols': teamColumns, '--team-rows': Math.max(1, Math.ceil(state.teamStandings.length / teamColumns)) } as CSSProperties}>
    <header className="stage-header">
      <div className="stage-brand"><LeagueHammerBrand compact /><div><p className="stage-eyebrow">LeagueHammer / Live broadcast</p><h1>{state.tournamentName}</h1></div></div>
      <div className="stage-header-actions"><span data-theme-slot /><ConnectionIndicator status={connection} /><button aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} onClick={() => { void toggleFullscreen(); }} title="Full screen · F11">{fullscreen ? <Minimize /> : <Maximize />}</button></div>
    </header>

    {(query.isError || screenError) && <p role="alert" className="stage-notice">{query.error?.message || screenError}</p>}
    <main className="stage-layout">
      <section className="stage-main" aria-label="Auction stage">
        <div className="stage-setline"><span><span className="stage-dot" />{state.isUnsoldRound ? state.currentSetName || 'Unsold round' : state.currentSetName || 'Auction stage'}</span><strong data-testid="stage-status">{state.sessionStatus === 'PAUSED' ? 'Auction paused' : state.sessionStatus === 'COMPLETED' ? 'Auction complete' : state.sessionStatus === 'READY' ? 'Starting soon' : 'Live from the floor'}</strong></div>

        {lot ? <article className="stage-spotlight" key={lot.lotId}>
          <PlayerPortrait key={lot.playerId} lot={lot} />
          <div className="stage-player-info">
            <div className="stage-player-meta"><span className="stage-position">{lot.position || 'Player'}</span><span>{lot.age != null ? `${lot.age} years` : ''}{lot.age != null && lot.preferredFoot ? ' / ' : ''}{lot.preferredFoot ? `${lot.preferredFoot} foot` : ''}</span></div>
            <p className="stage-eyebrow">{state.currentLot ? 'Now on the podium' : 'Latest result'}</p>
            <h2 data-testid="stage-player">{lot.playerName}</h2>
            <div className="stage-base"><span>Base price</span><strong>{money(lot.basePrice)}</strong></div>
            <div className={`stage-bid ${sold ? 'stage-bid-sold' : ''}`}>
              <p>{sold ? 'Winning bid' : unsold ? 'No sale recorded' : lot.currentBid != null ? 'Current leading bid' : 'Bidding opens at'}</p>
              <strong data-testid="stage-bid">{money(sold ? lot.finalPrice ?? 0 : lot.currentBid ?? lot.basePrice)}</strong>
              {leadingTeam && !unsold ? <div className="stage-leading">{leadingTeam.logoUrl ? <img src={leadingTeam.logoUrl} alt="" /> : <Shield size={24} />}<span>{leadingTeam.teamName}</span><b>{leadingTeam.shortName}</b></div> : <div className="stage-leading stage-no-leader">{unsold ? 'Returns to the unsold pool' : 'Waiting for the opening bid'}</div>}
            </div>
            {sold && <div className="stage-result stage-result-sold" data-testid="stage-result"><Gavel /><span>SOLD</span><span>Welcome to {lot.winningTeamName}</span></div>}
            {unsold && <div className="stage-result stage-result-unsold" data-testid="stage-result">{lot.attemptNumber >= 2 ? 'FINAL UNSOLD' : 'UNSOLD'}</div>}
          </div>
        </article> : <div className="stage-waiting"><div className="stage-pitch" /><Trophy size={90} /><p className="stage-eyebrow">The next chapter begins here</p><h2>{state.sessionStatus === 'COMPLETED' ? 'Squads assembled.' : 'The stage is set.'}</h2><p>{state.sessionStatus === 'READY' ? 'The auction will begin shortly.' : 'Waiting for the auctioneer to reveal the next player.'}</p></div>}

        <footer className="stage-progress"><div><span className="stage-eyebrow">Auction progress</span><strong>{state.totalSoldPlayersCount + state.totalUnsoldPlayersCount}<small> / {state.totalPlayersCount} players</small></strong></div><div className="stage-progress-track"><span style={{ width: `${Math.min(progress, 100)}%` }} /></div><div className="stage-count"><b>{state.totalSoldPlayersCount}</b><span>Sold</span></div><div className="stage-count"><b>{state.totalUnsoldPlayersCount}</b><span>Unsold</span></div></footer>
      </section>

      <aside className="stage-teams" aria-label="Live team purses and squads">
        <div className="stage-section-title"><div><p className="stage-eyebrow">The franchises</p><h2>Team tracker</h2></div><UsersCount count={state.teamStandings.length} /></div>
        <p className="stage-grid-legend">Remaining purse · Squad / maximum</p>
        <div className="stage-team-list">{state.teamStandings.map(team => <button key={team.teamId} className={`stage-team ${rosterTeam?.teamId === team.teamId ? 'stage-team-selected' : ''}`} style={{ '--club-color': team.primaryColor } as CSSProperties} onClick={() => setSelectedTeamId(team.teamId)} aria-pressed={rosterTeam?.teamId === team.teamId}>
          <div className="stage-team-name">{team.logoUrl && <img className="stage-team-logo" src={team.logoUrl} alt="" />}<span className="stage-club-code">{team.shortName}</span><strong title={team.teamName}>{team.teamName}</strong><ArrowUpRight size={18} /></div>
          <div className="stage-team-finance"><div><span>Purse remaining</span><b data-testid={`purse-${team.shortName}`}>{money(team.remainingPurse)}</b></div><div><span>Squad</span><b>{team.currentSquadSize}<small> / {team.maximumSquadSize}</small></b></div></div>
          <div className="stage-squad-progress"><span style={{ width: `${Math.min(100, team.currentSquadSize / Math.max(1, team.minimumSquadSize) * 100)}%` }} /></div>
        </button>)}</div>
        <details className="stage-roster" open={state.teamStandings.length <= 2} aria-label="Selected team roster"><summary className="stage-roster-heading"><h3>{rosterTeam?.shortName || 'Team'} / Current squad</h3><span>{roster.length} signed · View</span></summary><div className="stage-roster-list">{roster.length ? roster.map(player => <div key={player.lotId}><span><b>{player.playerName}</b><small>{player.position || 'Player'}</small></span><strong>{money(player.finalPrice ?? 0)}</strong></div>) : <p>The first signing is still to come.</p>}</div></details>
      </aside>
    </main>

    <div className="stage-ticker"><span className="stage-ticker-label"><Gavel size={19} />Recent signings</span><div className="stage-ticker-window"><div className="stage-ticker-track">{state.soldPlayers.length ? [0, 1].map(copy => <div className="stage-ticker-copy" key={copy} aria-hidden={copy === 1}>{state.soldPlayers.slice(0, 8).map(player => <span key={player.lotId}><b>{player.playerName}</b><span>{player.winningTeamName}</span><strong>{money(player.finalPrice ?? 0)}</strong><i>✦</i></span>)}</div>) : <p>Every signing. Every squad. Every moment.</p>}</div></div></div>
    {celebration && <div className="stage-confetti" aria-hidden="true" key={celebration.lotId}>{Array.from({ length: 32 }, (_, index) => <i key={index} style={{ '--x': `${(index * 31) % 100}%`, '--delay': `${(index % 7) * 0.1}s`, '--spin': `${index * 37}deg`, '--confetti-color': ['#b7f76b', '#ffd375', '#fff', leadingTeam?.primaryColor || '#69deff'][index % 4] } as CSSProperties} />)}</div>}
  </div>;
}

function UsersCount({ count }: { count: number }) { return <span className="stage-team-count">{count} teams</span>; }
