import { useState } from 'react';

export function ShareProjectorLink({ tournamentId }: { tournamentId: string }) {
  const [message, setMessage] = useState('');
  const [showLink, setShowLink] = useState(false);
  const url = new URL(`/tournaments/${tournamentId}/projector`, window.location.origin).href;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Projector link copied');
    } catch {
      setShowLink(true);
      setMessage('Select and copy the projector link below');
    }
  };
  return <div className="text-xs space-y-1">
    <button type="button" onClick={copy} className="text-emerald-300 hover:text-white">Copy Projector Link</button>
    {message && <p aria-live="polite" className="text-slate-400">{message}</p>}
    {showLink && <input aria-label="Shareable projector link" readOnly value={url} onFocus={event => event.target.select()} className="bg-slate-900 text-white border border-slate-700 p-2 rounded w-full" />}
  </div>;
}
