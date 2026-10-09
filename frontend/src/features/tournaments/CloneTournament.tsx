import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CopyPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function CloneTournament({ id, name }: { id: string; name: string }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [error, setError] = useState('');

  const clone = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || cloneName.trim().length < 3 || inFlight.current) return;
    inFlight.current = true; setCloning(true); setError('');
    try {
      const response = await fetch(`${API_BASE}/api/tournaments/${id}/clone`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cloneName.trim() }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        throw new Error(problem?.detail || 'Unable to clone this tournament. Please try again.');
      }
      const created = await response.json() as { id: string };
      dialog.current?.close();
      navigate(`/tournaments/${created.id}`);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to clone this tournament.');
    } finally { inFlight.current = false; setCloning(false); }
  };

  return <section aria-labelledby="clone-tournament-heading" className="rounded-2xl border border-slate-700 bg-[#191d28] p-5 sm:p-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <h3 id="clone-tournament-heading" className="text-sm font-bold text-white">Run a mock auction</h3>
        <p className="max-w-2xl text-xs leading-relaxed text-slate-400">Create an independent draft with the same teams, starting purses, auction rules, player sets and players. Every player starts available for a fresh auction.</p>
      </div>
      <button type="button" onClick={() => {
        setCloneName(`${name.slice(0, 186)} — Mock Auction`); setError(''); dialog.current?.showModal();
      }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-500/40 px-4 py-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10">
        <CopyPlus className="h-4 w-4" />Clone tournament
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="clone-dialog-title" onCancel={event => { if (inFlight.current) event.preventDefault(); }} className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-[#191d28] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75">
      <form onSubmit={clone} className="space-y-5 p-5 sm:p-6">
        <CopyPlus className="h-8 w-8 text-emerald-400" />
        <h2 id="clone-dialog-title" className="text-xl font-bold text-white">Clone tournament</h2>
        <p className="text-sm leading-relaxed text-slate-400">Copy the setup for a practice run. Bids, sold results, history and registration submissions are left behind. Player photos, card ratings and team logos are retained.</p>
        <div className="space-y-2">
          <label htmlFor="clone-tournament-name" className="block text-sm text-slate-300">New tournament name</label>
          <input id="clone-tournament-name" required minLength={3} maxLength={200} value={cloneName} disabled={cloning} onChange={event => setCloneName(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#101219] px-3 py-2.5 text-sm text-white focus:border-emerald-400 focus:outline-none" />
        </div>
        <p className="text-xs leading-relaxed text-slate-400">The new tournament gets separate sharing links. Review the copied setup and pass preflight before starting the mock auction. Its registration form starts disabled.</p>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={cloning} onClick={() => dialog.current?.close()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={cloning || cloneName.trim().length < 3} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{cloning ? 'Creating clone…' : 'Create clone'}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
