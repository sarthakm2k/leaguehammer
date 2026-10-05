import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useCallback, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useAuctionSocket } from './useAuctionSocket';
import { ConnectionIndicator } from './ConnectionIndicator';
import { CorrectionModal } from './CorrectionModal';
import type { AuctionEventDto, AuctionLotDto, AuctionStateDto } from './auctionTypes';

const API = import.meta.env.VITE_API_BASE_URL || '';
const PAGE_SIZE = 50;

function eventDetails(event: AuctionEventDto, names: Map<string, string>, symbol: string) {
  let data: Record<string, unknown>;
  try { data = JSON.parse(event.eventData); } catch { return 'Audit details unavailable'; }
  const money = (value: unknown) => typeof value === 'number' ? `${symbol}${value.toLocaleString()}` : '—';
  const team = (value: unknown) => typeof value === 'string' ? names.get(value) ?? value : 'Unsold';
  if (event.eventType === 'RESULT_CORRECTED') {
    return `${String(data.playerName ?? 'Player')}: ${team(data.oldTeamId)} · ${money(data.oldPrice)} → ${team(data.newTeamId)} · ${money(data.newPrice)}. Reason: ${String(data.reason ?? '')}`;
  }
  if (data.playerName) return `${data.playerName}${data.attemptNumber ? ` · Attempt ${data.attemptNumber}` : ''}${data.finalPrice ? ` · ${money(data.finalPrice)}` : ''}${data.teamName ? ` · ${data.teamName}` : ''}`;
  if (data.overrideReason) return `Owner override: ${data.overrideReason}. ${Array.isArray(data.deficientTeams) ? data.deficientTeams.join(', ') : ''}`;
  if (data.setName || data.SetName) return String(data.setName ?? data.SetName);
  if (data.unsoldPlayersCount) return `${data.unsoldPlayersCount} players in unsold round ${data.unsoldRoundNumber ?? 1}`;
  return '';
}

export function AuctionHistoryPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [correcting, setCorrecting] = useState<AuctionLotDto | null>(null);
  const read = async <T,>(path: string): Promise<T> => {
    const response = await fetch(`${API}/api/tournaments/${id}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error((await response.json()).detail || 'Could not load auction history');
    return response.json();
  };
  const enabled = !!id && !!token;
  const state = useQuery({ queryKey: ['auction-history-state', id, token], enabled, queryFn: () => read<AuctionStateDto>('/auction') });
  const history = useQuery({ queryKey: ['auction-history', id, token], enabled, queryFn: () => read<{ attempts: AuctionLotDto[] }>('/auction/history') });
  const membership = useQuery({ queryKey: ['auction-history-role', id, token], enabled, queryFn: () => read<{ userRole: string }>('') });
  const events = useInfiniteQuery({
    queryKey: ['auction-events', id, token], enabled, initialPageParam: 0,
    queryFn: ({ pageParam }) => read<AuctionEventDto[]>(`/auction/events?take=${PAGE_SIZE}&skip=${pageParam}`),
    getNextPageParam: (page, pages) => page.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
  });
  const { refetch: refreshState } = state;
  const { refetch: refreshHistory } = history;
  const { refetch: refreshEvents } = events;
  const synchronize = useCallback(async () => {
    await Promise.all([refreshState({ throwOnError: true }), refreshHistory({ throwOnError: true }), refreshEvents({ throwOnError: true })]);
  }, [refreshState, refreshHistory, refreshEvents]);
  const connection = useAuctionSocket(id, token, synchronize);
  const auction = state.data;
  const symbol = auction?.currencySymbol ?? '₹';
  const organizer = membership.data?.userRole === 'OWNER' || membership.data?.userRole === 'AUCTIONEER';
  const canCorrect = organizer && connection === 'connected' && !state.isError && !history.isError && !auction?.currentLot &&
    (auction?.sessionStatus === 'LIVE' || auction?.sessionStatus === 'PAUSED');
  const teams = new Map(auction?.teamStandings.map(team => [team.teamId, team.teamName]));
  const attempts = (history.data?.attempts ?? []).filter(lot =>
    (filter === 'ALL' || lot.status === filter || (filter === 'ROUND_2' && lot.attemptNumber >= 2)) &&
    `${lot.playerName} ${lot.playerSetName} ${lot.winningTeamName ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const error = state.error || history.error || events.error || membership.error;
  const confirmCorrection = async (newWinningTeamId: string, newFinalPrice: number, reason: string) => {
    if (!canCorrect || !correcting) throw new Error('Wait for synchronization and resolve any active player before correcting.');
    const response = await fetch(`${API}/api/tournaments/${id}/auction/correct-result`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ lotId: correcting.lotId, newWinningTeamId, newFinalPrice, reason }),
    });
    if (!response.ok) throw new Error((await response.json()).detail || 'Correction failed');
    setCorrecting(null);
    await synchronize();
  };
  return (
    <main className="league-history min-h-screen bg-[#101219] text-slate-100 p-5 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-wrap justify-between gap-4 items-center">
          <div><LeagueHammerBrand compact /><br /><Link className="text-emerald-300 text-sm" to={`/tournaments/${id}/auction`}>← Auction console</Link>
            <h1 className="text-3xl font-bold mt-3">Auction history</h1><p className="text-slate-400 mt-1">{auction?.tournamentName} · Each attempt is retained. Corrections append an audit record.</p></div>
          <ConnectionIndicator status={connection} />
        </header>
        {error && <p role="alert" className="p-4 rounded-xl bg-rose-950 text-rose-200">{error.message}</p>}
        {(state.isPending || history.isPending) && <p>Loading auction history…</p>}
        <section aria-label="Team purse balances" className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {auction?.teamStandings.map(team => <div key={team.teamId} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h2 className="font-bold">{team.teamName}</h2><p className="text-emerald-300 mt-2">{symbol}{team.remainingPurse.toLocaleString()} remaining</p>
            <p className="text-xs text-slate-400">{team.currentSquadSize} players · {symbol}{team.totalSpent.toLocaleString()} spent</p>
          </div>)}
        </section>
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <h2 className="text-xl font-bold">Player attempts</h2>
          <div className="flex flex-wrap gap-3">
            <input aria-label="Search auction history" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search player, set or team" className="p-3 bg-slate-950 border border-slate-700 rounded-xl flex-1 min-w-0" />
            <select aria-label="Filter attempts" value={filter} onChange={event => setFilter(event.target.value)} className="p-3 bg-slate-950 border border-slate-700 rounded-xl">
              <option value="ALL">All results</option><option value="SOLD">Sold</option><option value="UNSOLD">Unsold</option><option value="ROUND_2">{auction?.sellAllPlayers ? 'Unsold rounds' : 'Final unsold round'}</option>
            </select>
          </div>
          <p className="text-xs text-slate-400">Corrections are available for the latest completed result before its next attempt. Resolve the active player first.</p>
          <div className="overflow-x-auto"><table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-slate-400"><tr>{['Player / Set', 'Attempt', 'Result', 'Team / Price', 'Recorded', ''].map((title, index) => <th key={index} className="p-3">{title}</th>)}</tr></thead>
            <tbody>{attempts.map(lot => <tr key={lot.lotId} data-testid={`attempt-${lot.lotId}`} className="border-t border-slate-800">
              <td data-label="Player / Set" className="p-3"><strong>{lot.playerName}</strong><p className="text-xs text-slate-400">{lot.playerSetName}</p></td>
              <td data-label="Attempt" className="p-3">Attempt {lot.attemptNumber}</td><td data-label="Result" className={`p-3 font-bold ${lot.status === 'SOLD' ? 'text-emerald-300' : 'text-amber-300'}`}>{lot.status}{lot.status === 'UNSOLD' && lot.attemptNumber === 2 && !auction?.sellAllPlayers ? ' · Final' : ''}</td>
              <td data-label="Team / Price" className="p-3">{lot.winningTeamName ?? '—'}<p>{lot.finalPrice == null ? '—' : `${symbol}${lot.finalPrice.toLocaleString()}`}</p></td>
              <td data-label="Recorded" className="p-3 text-xs text-slate-400">{lot.completedAtUtc ? new Date(lot.completedAtUtc).toLocaleString() : '—'}</td>
              <td data-label="Action" className="p-3">{canCorrect && auction?.lastResult?.lotId === lot.lotId &&
                !(auction?.isUnsoldRound && lot.attemptNumber < auction.currentAttemptNumber && lot.status === 'UNSOLD') &&
                !history.data?.attempts.some(attempt => attempt.playerId === lot.playerId && attempt.attemptNumber > lot.attemptNumber) &&
                <button onClick={() => setCorrecting(lot)} className="text-amber-300 font-bold">Correct result</button>}</td>
            </tr>)}</tbody>
          </table></div>
          {!attempts.length && <p className="text-slate-400">No completed attempts match this view.</p>}
        </section>
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4">
          <h2 className="text-xl font-bold">Audit trail</h2>
          {(events.data?.pages.flat() ?? []).map(event => <article key={event.id} className="border-t border-slate-800 pt-4" data-testid="audit-event">
            <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold text-emerald-300">{event.eventType.replaceAll('_', ' ')}</h3><time className="text-xs text-slate-400">{new Date(event.createdAtUtc).toLocaleString()} · {event.userName}</time></div>
            <p className="text-sm text-slate-300 mt-2 break-words">{eventDetails(event, teams, symbol)}</p>
          </article>)}
          {!events.data?.pages[0]?.length && <p className="text-slate-400">No auction events yet.</p>}
          {events.hasNextPage && <button disabled={events.isFetchingNextPage} onClick={() => events.fetchNextPage()} className="p-3 bg-slate-800 rounded-xl">{events.isFetchingNextPage ? 'Loading…' : 'Load older events'}</button>}
        </section>
      </div>
      {correcting && auction && <CorrectionModal lot={correcting} teams={auction.teamStandings} currencySymbol={symbol} minimumAcquisitionPrice={auction.minimumAcquisitionPrice} onConfirm={confirmCorrection} onClose={() => setCorrecting(null)} />}
    </main>
  );
}
