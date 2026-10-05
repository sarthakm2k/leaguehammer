import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Copy } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import type { AuctionResults } from './resultsTypes';

const API = import.meta.env.VITE_API_BASE_URL || '';

export function AuctionRecapLinks({ tournamentId, slug, publicView = false }: { tournamentId: string; slug?: string; publicView?: boolean }) {
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState(false);
  const key = publicView ? slug : tournamentId;
  const query = useQuery({
    queryKey: ['auction-results', publicView, key, publicView ? null : token], enabled: !!key && (publicView || !!token),
    queryFn: async () => {
      const response = await fetch(`${API}/api/${publicView ? `public/tournaments/${key}` : `tournaments/${key}`}/results`,
        { headers: publicView ? {} : { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Recap access is unavailable');
      return response.json() as Promise<AuctionResults>;
    },
  });
  const data = query.data;
  if (!data || query.isError || data.state.sessionStatus !== 'COMPLETED') return null;
  const publicPath = `/live/${encodeURIComponent(data.state.slug)}/recap`;
  const url = new URL(publicPath, window.location.origin).href;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Recap link copied'); }
    catch { setFallback(true); setMessage('Select and copy the recap link'); }
  };
  return <div className="flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/5 p-3 text-xs">
    <Link to={publicView ? publicPath : `/tournaments/${tournamentId}/recap`} className="inline-flex items-center gap-1.5 font-bold text-fuchsia-200">Open Auction Recap <ArrowUpRight size={15} /></Link>
    {data.publicLiveViewEnabled ? <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 text-fuchsia-200"><Copy size={14} />Copy Recap Link</button>
      : <span className="text-slate-400">Public recap sharing is disabled in tournament settings.</span>}
    {message && <span aria-live="polite" className="text-slate-300">{message}</span>}
    {fallback && <input aria-label="Shareable recap link" readOnly value={url} onFocus={event => event.target.select()} className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-slate-200" />}
  </div>;
}
