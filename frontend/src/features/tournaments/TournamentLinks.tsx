import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink, Link2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { ShareAuctioneerLink } from '../auction/ShareAuctioneerLink';
import type { Team } from './tabs/TeamsTab';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function ViewerLink({ label, path, openPath = path, note }: { label: string; path: string; openPath?: string; note: string }) {
  const [message, setMessage] = useState('');
  const url = new URL(path, window.location.origin).href;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage(`${label} link copied`); }
    catch { setMessage('Select the link below and copy it.'); }
  };
  return <div className="min-w-0 space-y-3 rounded-2xl border border-slate-700/60 bg-slate-900/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-bold text-white">{label}</h3>
      <Link to={openPath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline" aria-label={`Open ${label}`}>
        Open <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
    <p className="text-xs leading-relaxed text-slate-400">{note}</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label={`${label} sharing link`} readOnly value={url} onFocus={event => event.target.select()} className="w-full min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" />
      <button type="button" onClick={copy} aria-label={`Copy ${label} link`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500 hover:text-emerald-400">
        <Copy className="h-3.5 w-3.5" />Copy link
      </button>
    </div>
    {message && <p role="status" className="text-xs text-emerald-400">{message}</p>}
  </div>;
}

export function TournamentLinks({ tournamentId, slug, status }: { tournamentId: string; slug: string; status: string }) {
  const { token } = useAuth();
  const load = async <T,>(resource: string, signal: AbortSignal): Promise<T> => {
    const response = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/${resource}`, { signal, headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Unable to load ${resource}`);
    return response.json();
  };
  const teams = useQuery({ queryKey: ['overview-links-teams', tournamentId, token], queryFn: ({ signal }) => load<Team[]>('teams', signal), enabled: !!token, retry: 1 });
  const settings = useQuery({ queryKey: ['overview-links-settings', tournamentId, token], queryFn: ({ signal }) => load<{ publicLiveViewEnabled: boolean }>('settings', signal), enabled: !!token, retry: 1 });
  const publicRoot = `/live/${encodeURIComponent(slug)}`;
  const memberRoot = `/tournaments/${tournamentId}`;
  const completed = status === 'COMPLETED';
  return <section aria-labelledby="tournament-links-heading" className="space-y-5 rounded-2xl border border-slate-700/60 bg-slate-900/30 p-4 sm:p-6">
    <div className="flex items-start gap-3">
      <Link2 className="mt-1 h-5 w-5 shrink-0 text-emerald-400" />
      <div>
        <h2 id="tournament-links-heading" className="text-lg font-bold text-white">Tournament links</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">Open every tournament view here. Viewer links can be shared on any device without signing in.</p>
      </div>
    </div>
    {settings.data?.publicLiveViewEnabled === false && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400">Public viewing is off. Enable Public Live View in Auction Rules &amp; Purse before sharing viewer links.</p>}
    {settings.isError && <p className="text-xs text-amber-400">Public viewing availability could not be checked. <button type="button" onClick={() => void settings.refetch()} className="underline">Retry</button></p>}
    {status !== 'DRAFT' ? <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><ShareAuctioneerLink tournamentId={tournamentId} /></div> : <p className="text-xs text-slate-400">The auctioneer panel link becomes available after preflight approval.</p>}
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <ViewerLink label="Projector" path={`${publicRoot}/projector`} note="Live broadcast for laptops, phones and hall displays." />
      <ViewerLink label="Public auction view" path={publicRoot} note="Live bidding, teams, players and auction progress." />
      <ViewerLink label="Results & statistics" path={`${publicRoot}?view=results`} openPath={`${memberRoot}/results`} note="Open your results dashboard; copy the public results link to share." />
      <ViewerLink label="Auction recap" path={`${publicRoot}/recap`} openPath={`${memberRoot}/recap`} note={completed ? 'Open your recap; copy the public single-page highlights link.' : 'Available after the auction is completed. You can copy the sharing link in advance.'} />
      <ViewerLink label="Auction Wrapped" path={`${publicRoot}/wrapped`} openPath={`${memberRoot}/wrapped`} note={completed ? 'Open Wrapped; share the mobile story with highlights and final squads.' : 'Available after the auction is completed. You can copy the sharing link in advance.'} />
    </div>
    <div className="space-y-3 border-t border-slate-700/60 pt-5">
      <h3 className="text-sm font-bold text-white">Team sharing links</h3>
      <p className="text-xs text-slate-400">Each franchise gets its own live purse, squad, remaining slots and player pool.</p>
      {teams.isPending && <p role="status" className="text-xs text-slate-400">Loading team links…</p>}
      {teams.isError && <p className="text-xs text-amber-400">Team links could not be loaded. <button type="button" onClick={() => void teams.refetch()} className="underline">Retry</button></p>}
      {teams.data?.length === 0 && <p className="text-xs text-slate-400">Add participating teams to generate their sharing links.</p>}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {teams.data?.map(team => <ViewerLink key={team.id} label={team.name} path={`${publicRoot}/teams/${team.id}`} note={`${team.shortName} · Team dashboard and signed players`} />)}
      </div>
    </div>
  </section>;
}
