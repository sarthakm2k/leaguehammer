import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { 
  Layers, 
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Trash2, 
  Edit2, 
  AlertCircle, 
  CheckCircle2, 
  Users, 
  X,
  Sparkles
} from 'lucide-react';

interface PlayerSet {
  id: string;
  tournamentId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  playerCount: number;
  createdAtUtc: string;
}

interface Props {
  tournamentId: string;
  isOwner: boolean;
  status: string;
}

export function PlayerSetsTab({ tournamentId, isOwner, status }: Props) {
  const { token } = useAuth();
  const [sets, setSets] = useState<PlayerSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSet, setEditingSet] = useState<PlayerSet | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5050';
  const isDraft = status === 'DRAFT';

  const fetchSets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load player sets');
      const data: PlayerSet[] = await res.json();
      setSets(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading player sets');
    } finally {
      setLoading(false);
    }
  }, [token, tournamentId, API_BASE]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  const openCreateModal = () => {
    setEditingSet(null);
    setName('');
    setDescription('');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (s: PlayerSet) => {
    setEditingSet(s);
    setName(s.name);
    setDescription(s.description || '');
    setModalError(null);
    setModalOpen(true);
  };

  const handleSaveSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setModalError('Set name is required');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    try {
      const isEditing = !!editingSet;
      const url = isEditing
        ? `${API_BASE}/api/tournaments/${tournamentId}/player-sets/${editingSet.id}`
        : `${API_BASE}/api/tournaments/${tournamentId}/player-sets`;

      const method = isEditing ? 'PUT' : 'POST';
      const body = isEditing
        ? { name: name.trim(), description: description.trim() || null, sortOrder: editingSet.sortOrder }
        : { name: name.trim(), description: description.trim() || null };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to save set' }));
        throw new Error(data.detail || 'Failed to save set');
      }

      setModalOpen(false);
      setSuccess(isEditing ? 'Player set updated successfully' : 'Player set created successfully');
      setTimeout(() => setSuccess(null), 3000);
      await fetchSets();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error saving set');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSet = async (setId: string, setName: string, count: number) => {
    if (count > 0) {
      alert(`Cannot delete set "${setName}" because it contains ${count} player(s). Reassign or delete players first.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete set "${setName}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets/${setId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to delete set' }));
        throw new Error(data.detail || 'Failed to delete set');
      }

      setSuccess(`Set "${setName}" deleted`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchSets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error deleting set');
    }
  };

  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sets.length) return;

    const newSets = [...sets];
    const temp = newSets[index];
    newSets[index] = newSets[targetIndex];
    newSets[targetIndex] = temp;

    setSets(newSets);

    try {
      const orderedIds = newSets.map(s => s.id);
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderedSetIds: orderedIds })
      });

      if (!res.ok) throw new Error('Failed to update order');
      await fetchSets();
    } catch {
      setError('Failed to persist set reordering');
      await fetchSets();
    }
  };

  const handleSeedSuggestedSets = async () => {
    const defaults = [
      { name: 'Marquee Players', description: 'Headline stars and elite tier players' },
      { name: 'Attackers', description: 'Centre-forwards and wingers' },
      { name: 'Midfielders', description: 'Central and attacking playmakers' },
      { name: 'Defenders', description: 'Centre-backs and full-backs' },
      { name: 'Goalkeepers', description: 'Shot-stoppers and custodians' }
    ];

    setSubmitting(true);
    try {
      for (const s of defaults) {
        if (!sets.some(existing => existing.name.toLowerCase() === s.name.toLowerCase())) {
          await fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ name: s.name, description: s.description })
          });
        }
      }
      setSuccess('Standard football sets initialized successfully');
      setTimeout(() => setSuccess(null), 3000);
      await fetchSets();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding standard sets');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Player Sets & Sequences</h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Organize players into sequential auction sets (e.g. Marquee, Attackers, Midfielders, Goalkeepers).
              </p>
            </div>
          </div>
        </div>

        {isOwner && isDraft && (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            {sets.length === 0 && (
              <button
                type="button"
                onClick={handleSeedSuggestedSets}
                disabled={submitting}
                className="flex items-center justify-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Auto-add Standard Sets</span>
              </button>
            )}
            <button
              type="button"
              onClick={openCreateModal}
              className="flex items-center justify-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-lg shadow-purple-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Player Set</span>
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center space-x-3 text-rose-400 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center space-x-3 text-emerald-400 text-xs">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Sets List */}
      {loading ? (
        <div className="py-12 flex justify-center items-center text-slate-500 text-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mr-3"></div>
          Loading player sets...
        </div>
      ) : sets.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center">
          <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-white font-semibold text-sm">No player sets defined yet</h4>
          <p className="text-slate-400 text-xs max-w-md mx-auto mt-1 mb-5">
            Player sets determine the grouping and chronological order in which players will appear during the live auction.
          </p>
          {isOwner && isDraft && (
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={handleSeedSuggestedSets}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Initialize 5 Standard Sets</span>
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Custom Set</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {sets.map((s, index) => (
            <div
              key={s.id}
              className="bg-slate-900/80 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4.5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start sm:items-center space-x-4">
                <div className="flex flex-col items-center justify-center w-10 h-10 rounded-xl bg-slate-800 text-purple-400 font-black text-sm border border-slate-700/60 flex-shrink-0">
                  #{s.sortOrder}
                </div>
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h4 className="font-bold text-white text-sm tracking-tight">{s.name}</h4>
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      <Users className="w-3 h-3" />
                      <span>{s.playerCount} players</span>
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-slate-400 text-xs mt-1 max-w-xl">{s.description}</p>
                  )}
                </div>
              </div>

              {isOwner && isDraft && (
                <div className="flex items-center space-x-2 self-end sm:self-center">
                  <div className="flex items-center bg-slate-800/80 rounded-xl p-1 border border-slate-700/50">
                    <button
                      type="button"
                      onClick={() => handleMoveOrder(index, 'up')}
                      disabled={index === 0}
                      title="Move earlier in auction"
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveOrder(index, 'down')}
                      disabled={index === sets.length - 1}
                      title="Move later in auction"
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 rounded-lg hover:bg-slate-700 transition cursor-pointer"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditModal(s)}
                    title="Edit set"
                    className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-700/80 rounded-xl border border-slate-700/50 transition cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSet(s.id, s.name, s.playerCount)}
                    title={s.playerCount > 0 ? "Cannot delete set with assigned players" : "Delete set"}
                    className={`p-2 rounded-xl border transition cursor-pointer ${
                      s.playerCount > 0
                        ? 'opacity-40 text-slate-600 border-slate-800 cursor-not-allowed'
                        : 'text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/20'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Set Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2.5">
                <Layers className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-white text-base">
                  {editingSet ? 'Edit Player Set' : 'Create Player Set'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveSet} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Set Name <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Marquee Players, Attackers, Goalkeepers"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Description <span className="text-slate-500">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional brief description of this auction round or position category..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-purple-500 rounded-xl p-3 text-sm text-white focus:outline-none transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingSet ? 'Update Set' : 'Create Set'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
