import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Trash2, Tag, AlertCircle } from 'lucide-react';
import { formatInr } from '../../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface BasePriceTier {
  id: string;
  tournamentId: string;
  label: string;
  amount: number;
  sortOrder: number;
}

interface Props {
  tournamentId: string;
  isOwner: boolean;
  status: string;
}

export function BasePriceTiersTab({ tournamentId, isOwner, status }: Props) {
  const { token } = useAuth();
  const [tiers, setTiers] = useState<BasePriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New tier inputs
  const [amount, setAmount] = useState<number>(2500);
  const [label, setLabel] = useState<string>('₹2,500');
  const [adding, setAdding] = useState(false);

  const fetchTiers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/base-price-tiers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load base price tiers');
      const data = await res.json();
      setTiers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading tiers');
    } finally {
      setLoading(false);
    }
  }, [token, tournamentId]);

  useEffect(() => {
    fetchTiers();
  }, [fetchTiers]);

  const handleAddTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || status !== 'DRAFT') return;
    setError(null);
    setAdding(true);

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/base-price-tiers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          label: label.trim() || formatInr(amount),
          amount,
          sortOrder: tiers.length + 1
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to add tier');
      }

      setAmount(amount + 1000);
      setLabel(formatInr(amount + 1000));
      await fetchTiers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error adding tier');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTier = async (tierId: string) => {
    if (!isOwner || status !== 'DRAFT') return;
    if (!confirm('Are you sure you want to remove this base price tier?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/base-price-tiers/${tierId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete tier');
      await fetchTiers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error deleting tier');
    }
  };

  const isLocked = status !== 'DRAFT';

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center space-x-3 text-rose-400 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-[#191d28] border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="border-b border-slate-800 pb-4">
          <h3 className="text-base font-bold text-white">Player Base Price Tiers</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Standard pricing tiers presented when creating and categorizing players for auction.
          </p>
        </div>

        {/* Existing Tiers Grid */}
        {loading ? (
          <div className="text-xs text-slate-400 py-6 text-center">Loading tiers...</div>
        ) : tiers.length === 0 ? (
          <div className="text-xs text-slate-500 py-6 text-center">No tiers configured yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {tiers.map((t) => (
              <div
                key={t.id}
                className="relative group rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-col items-center justify-center space-y-1 hover:border-emerald-500/40 transition-all"
              >
                <Tag className="w-4 h-4 text-emerald-400 mb-1" />
                <span className="text-base font-black font-mono text-white tracking-tight">
                  {formatInr(t.amount)}
                </span>
                <span className="text-[11px] text-slate-400">{t.label}</span>

                {isOwner && !isLocked && (
                  <button
                    onClick={() => handleDeleteTier(t.id)}
                    className="absolute top-2 right-2 text-slate-500 hover:text-rose-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete tier"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add Tier Form */}
        {isOwner && !isLocked && (
          <form onSubmit={handleAddTier} className="pt-4 border-t border-slate-800 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-300">Amount (₹)</label>
              <input
                type="number"
                min="100"
                step="50"
                required
                value={amount}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setAmount(val);
                  setLabel(formatInr(val));
                }}
                className="w-36 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-300">Display Label</label>
              <input
                type="text"
                required
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. ₹2,500"
                className="w-44 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={adding}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{adding ? 'Adding...' : 'Add Tier'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
