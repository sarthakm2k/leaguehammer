import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Save, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface TournamentSettings {
  id: string;
  tournamentId: string;
  currencyCode: string;
  currencySymbol: string;
  defaultStartingPurse: number;
  minimumSquadSize: number;
  maximumSquadSize: number;
  minimumAcquisitionPrice: number;
  defaultBidIncrement: number;
  publicLiveViewEnabled: boolean;
  sellAllPlayers: boolean;
}

interface Props {
  tournamentId: string;
  isOwner: boolean;
  status: string;
}

export function TournamentSettingsTab({ tournamentId, isOwner, status }: Props) {
  const { token } = useAuth();
  const [, setSettings] = useState<TournamentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form states
  const [currencyCode, setCurrencyCode] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [defaultStartingPurse, setDefaultStartingPurse] = useState<number>(100000);
  const [minimumSquadSize, setMinimumSquadSize] = useState<number>(12);
  const [maximumSquadSize, setMaximumSquadSize] = useState<number>(16);
  const [minimumAcquisitionPrice, setMinimumAcquisitionPrice] = useState<number>(500);
  const [defaultBidIncrement, setDefaultBidIncrement] = useState<number>(100);
  const [publicLiveViewEnabled, setPublicLiveViewEnabled] = useState(true);
  const [sellAllPlayers, setSellAllPlayers] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load settings');
      const data: TournamentSettings = await res.json();
      setSettings(data);
      setCurrencyCode(data.currencyCode);
      setCurrencySymbol(data.currencySymbol);
      setDefaultStartingPurse(data.defaultStartingPurse);
      setMinimumSquadSize(data.minimumSquadSize);
      setMaximumSquadSize(data.maximumSquadSize);
      setMinimumAcquisitionPrice(data.minimumAcquisitionPrice);
      setDefaultBidIncrement(data.defaultBidIncrement);
      setPublicLiveViewEnabled(data.publicLiveViewEnabled);
      setSellAllPlayers(data.sellAllPlayers);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading settings');
    } finally {
      setLoading(false);
    }
  }, [token, tournamentId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || status !== 'DRAFT') return;
    setError(null);
    setSuccess(false);

    if (maximumSquadSize < minimumSquadSize) {
      setError('Maximum squad size cannot be less than minimum squad size.');
      return;
    }

    const minReserve = minimumSquadSize * minimumAcquisitionPrice;
    if (defaultStartingPurse < minReserve) {
      setError(`Starting purse (${formatCurrency(defaultStartingPurse, currencyCode)}) must be at least the minimum squad reserve (${formatCurrency(minReserve, currencyCode)}).`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currencyCode,
          currencySymbol,
          defaultStartingPurse,
          minimumSquadSize,
          maximumSquadSize,
          minimumAcquisitionPrice,
          defaultBidIncrement,
          publicLiveViewEnabled,
          sellAllPlayers
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to update settings');
      }

      const updated = await res.json();
      setSettings(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-slate-400 py-8 text-center">Loading tournament rules...</div>;
  }

  const isLocked = status !== 'DRAFT';
  const calculatedReserve = minimumSquadSize * minimumAcquisitionPrice;

  return (
    <div className="space-y-6">
      {isLocked && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center space-x-3 text-amber-300 text-xs">
          <ShieldAlert className="w-5 h-5 flex-shrink-0" />
          <span>Auction rules are locked because this tournament is not in DRAFT status.</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-center space-x-3 text-rose-400 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center space-x-3 text-emerald-400 text-xs">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>Auction rules and purse limits successfully saved!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-[#191d28] border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Auction Rules & Financial Constraints</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative parameters governing team budgets, squad limits, and minimum acquisition prices.
            </p>
          </div>
          {isOwner && !isLocked && (
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Rules'}</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Starting Purse */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Default Starting Purse
            </label>
            <p className="text-[11px] text-slate-500">Starting budget given to newly created teams.</p>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-semibold text-slate-400">
                {currencySymbol}
              </span>
              <input
                type="number"
                min="1000"
                step="100"
                required
                disabled={isLocked || !isOwner}
                value={defaultStartingPurse}
                onChange={(e) => setDefaultStartingPurse(Number(e.target.value))}
                className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>
            <p className="text-[11px] text-emerald-400 font-medium">
              Formatted: {formatCurrency(defaultStartingPurse, currencyCode)}
            </p>
          </div>

          {/* Minimum Acquisition Price */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Minimum Acquisition Price
            </label>
            <p className="text-[11px] text-slate-500">Floor price for purchasing any player during auction.</p>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-semibold text-slate-400">
                {currencySymbol}
              </span>
              <input
                type="number"
                min="10"
                step="10"
                required
                disabled={isLocked || !isOwner}
                value={minimumAcquisitionPrice}
                onChange={(e) => setMinimumAcquisitionPrice(Number(e.target.value))}
                className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Formatted: {formatCurrency(minimumAcquisitionPrice, currencyCode)}
            </p>
          </div>

          {/* Squad Limits */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Minimum Squad Size
            </label>
            <p className="text-[11px] text-slate-500">Must be fulfilled before auction can complete.</p>
            <input
              type="number"
              min="1"
              max="50"
              required
              disabled={isLocked || !isOwner}
              value={minimumSquadSize}
              onChange={(e) => setMinimumSquadSize(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Maximum Squad Size
            </label>
            <p className="text-[11px] text-slate-500">Hard limit on total players a team can own.</p>
            <input
              type="number"
              min={minimumSquadSize}
              max="50"
              required
              disabled={isLocked || !isOwner}
              value={maximumSquadSize}
              onChange={(e) => setMaximumSquadSize(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
          </div>

          {/* Default Bid Increment */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Default Bid Increment
            </label>
            <p className="text-[11px] text-slate-500">Recommended bidding jump step.</p>
            <div className="relative mt-1">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm font-semibold text-slate-400">
                {currencySymbol}
              </span>
              <input
                type="number"
                min="10"
                step="10"
                required
                disabled={isLocked || !isOwner}
                value={defaultBidIncrement}
                onChange={(e) => setDefaultBidIncrement(Number(e.target.value))}
                className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Increment: {formatCurrency(defaultBidIncrement, currencyCode)}
            </p>
          </div>

          {/* Currency Configuration */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-300">
              Currency
            </label>
            <p className="text-[11px] text-slate-500">Used for labels and symbol display.</p>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <select
                disabled={isLocked || !isOwner}
                value={currencyCode}
                onChange={(e) => {
                  setCurrencyCode(e.target.value);
                  if (e.target.value === 'INR') setCurrencySymbol('₹');
                  if (e.target.value === 'USD') setCurrencySymbol('$');
                  if (e.target.value === 'EUR') setCurrencySymbol('€');
                  if (e.target.value === 'GBP') setCurrencySymbol('£');
                }}
                className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              >
                <option value="INR">INR (Indian Rupee)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>

              <input
                type="text"
                maxLength={5}
                disabled={isLocked || !isOwner}
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="Symbol (e.g. ₹)"
                className="px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Live Calculation Info Banner */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <h4 className="text-xs font-bold text-slate-200">Mathematical Feasibility Guardrail:</h4>
          <div className="text-xs text-slate-400 space-y-1">
            <p>
              • Required minimum reserve per team: <strong className="text-emerald-400 font-mono">{formatCurrency(calculatedReserve, currencyCode)}</strong> ({minimumSquadSize} players × {formatCurrency(minimumAcquisitionPrice, currencyCode)} floor)
            </p>
            <p>
              • Maximum allowable spend on first player: <strong className="text-amber-400 font-mono">{formatCurrency(Math.max(0, defaultStartingPurse - ((minimumSquadSize - 1) * minimumAcquisitionPrice)), currencyCode)}</strong>
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
            <input type="checkbox" checked={sellAllPlayers} disabled={isLocked || !isOwner} onChange={event => setSellAllPlayers(event.target.checked)} />
            Sell all players
          </label>
          <p className="text-xs text-slate-400">When enabled, unsold players move into another unsold round until every player is sold. Each attempt is retained. Purse and squad limits still apply.</p>
          <p className="text-xs text-slate-400">Every bid, sale, and correction must leave enough purse and squad space to buy all remaining players at their base prices.</p>
          <p className="text-xs text-slate-500">When disabled, players receive one final unsold round and remain unsold after their second attempt.</p>
        </div>

        {/* Live View Toggle */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-slate-200">Public Live Auction Portal</span>
            <p className="text-[11px] text-slate-500">Allow spectators and teams to view live auction progress at /live/{'{slug}'}</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              disabled={isLocked || !isOwner}
              checked={publicLiveViewEnabled}
              onChange={(e) => setPublicLiveViewEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
      </form>
    </div>
  );
}
