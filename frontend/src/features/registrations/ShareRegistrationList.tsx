import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Copy, ExternalLink } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { registrationRequest } from './registrationApi';

export function ShareRegistrationList({ tournamentId }: { tournamentId: string }) {
  const { token } = useAuth();
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey:['registration-view-link',tournamentId,token],
    queryFn: async ({signal}) => {
      const result = await registrationRequest<{path:string}>(`/api/tournaments/${tournamentId}/registrations/view-link`,{signal,headers:{Authorization:`Bearer ${token}`}});
      if (!result.path?.startsWith('/registrations/')) throw new Error('The registration viewing link could not be loaded.');
      return result;
    },
    enabled:!!token,
    retry:1,
  });
  const url = query.data ? new URL(query.data.path,window.location.origin).href : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Registered players link copied.'); }
    catch { setMessage('Select and copy the link below.'); }
  };
  return <div className="min-w-0 space-y-3 rounded-2xl border border-emerald-500/30 bg-slate-900/50 p-4" aria-label="Registered players sharing">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">Registered players</h3>{query.data && <Link to={query.data.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline" aria-label="Open registered players list">Open <ExternalLink className="h-3.5 w-3.5" /></Link>}</div>
    <p className="text-xs leading-relaxed text-slate-400">Share with organizers to view registrations so far, including photos and review status. Anyone with this link can view the list without signing in. Viewing only; contact details and review notes stay private.</p>
    {query.isPending && <p role="status" className="text-xs text-slate-400">Loading registration viewing link…</p>}
    {query.isError && <p role="alert" className="text-xs text-amber-400">The registration viewing link could not be loaded. <button type="button" onClick={() => void query.refetch()} className="underline">Retry</button></p>}
    {url && <div className="flex flex-wrap gap-2"><input aria-label="Registered players sharing link" readOnly value={url} onFocus={event => event.target.select()} className="w-full min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" /><button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-500" aria-label="Copy registered players link"><Copy className="h-3.5 w-3.5" />Copy link</button></div>}
    {message && <p role="status" className="text-xs text-emerald-400">{message}</p>}
  </div>;
}
