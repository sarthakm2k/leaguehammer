import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function DeleteTournament({ id, name, status }: { id: string; name: string; status: string }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const requestInFlight = useRef(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const blocked = status === 'LIVE';

  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || blocked || confirmation.trim() !== name || requestInFlight.current) return;
    requestInFlight.current = true;
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/api/tournaments/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null);
        throw new Error(problem?.detail || 'Unable to delete this tournament. Please try again.');
      }
      queryClient.removeQueries({ predicate: query => query.queryKey.includes(id) });
      dialog.current?.close();
      navigate('/dashboard', { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete this tournament.');
    } finally {
      requestInFlight.current = false;
      setDeleting(false);
    }
  };

  return <section className="rounded-2xl border border-rose-500/25 bg-[#191d28] p-5 sm:p-6" aria-labelledby="delete-tournament-heading">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <h3 id="delete-tournament-heading" className="text-sm font-bold text-white">Delete tournament</h3>
        <p className="max-w-2xl text-xs leading-relaxed text-slate-400">Permanently remove this tournament, registrations, teams, players and auction results. Shared tournament links will stop working.</p>
        {blocked && <p className="text-xs text-amber-400">Complete the live or paused auction before deleting this tournament.</p>}
      </div>
      <button type="button" disabled={blocked} onClick={() => {
        setConfirmation(''); setError(''); dialog.current?.showModal();
      }} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-500/40 px-4 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50">
        <Trash2 className="h-4 w-4" />Delete tournament
      </button>
    </div>
    <dialog ref={dialog} aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description" onCancel={event => { if (requestInFlight.current) event.preventDefault(); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rose-500/30 bg-[#191d28] p-0 text-slate-100 shadow-2xl backdrop:bg-black/75">
      <form onSubmit={remove} className="space-y-5 p-5 sm:p-6">
        <AlertTriangle className="h-8 w-8 text-rose-400" />
        <h2 id="delete-dialog-title" className="text-xl font-bold text-white">Delete {name}?</h2>
        <p id="delete-dialog-description" className="text-sm leading-relaxed text-slate-400">This permanently deletes the tournament and all its registration and auction records, including results, recap and Wrapped. This cannot be undone. Your account and other tournaments are kept.</p>
        <div className="space-y-2">
          <label htmlFor="delete-tournament-confirmation" className="block text-sm text-slate-300">Type <strong className="break-words text-white">{name}</strong> to confirm</label>
          <input id="delete-tournament-confirmation" autoComplete="off" value={confirmation} disabled={deleting} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-[#101219] px-3 py-2.5 text-sm text-white focus:border-rose-400 focus:outline-none" />
        </div>
        {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" disabled={deleting} onClick={() => dialog.current?.close()} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={deleting || confirmation.trim() !== name} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{deleting ? 'Deleting…' : 'Permanently delete'}</button>
        </div>
      </form>
    </dialog>
  </section>;
}
