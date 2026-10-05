import { useState } from 'react';
import { Copy } from 'lucide-react';

export function ShareAuctioneerLink({ tournamentId }: { tournamentId: string }) {
  const [message, setMessage] = useState('');
  const url = new URL(`/tournaments/${tournamentId}/auction`, window.location.origin).href;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setMessage('Auctioneer link copied'); }
    catch { setMessage('Select and copy the auctioneer link'); }
  };
  return <div className="w-full space-y-2">
    <label htmlFor="auctioneer-panel-link" className="block text-xs font-semibold text-slate-200">Auctioneer panel link</label>
    <div className="flex flex-wrap gap-2">
      <input id="auctioneer-panel-link" readOnly value={url} onFocus={event => event.target.select()} className="flex-1 min-w-0 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-slate-300" />
      <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10">
        <Copy className="h-3.5 w-3.5" />Copy Auctioneer Link
      </button>
    </div>
    <p className="text-xs text-slate-400">Sign in using the same account used to configure this tournament. Opening the link after sign-in takes you to this auctioneer panel.</p>
    {message && <p aria-live="polite" className="text-xs text-emerald-300">{message}</p>}
  </div>;
}
