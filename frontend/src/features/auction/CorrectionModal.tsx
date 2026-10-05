import React, { useState } from 'react';
import { X, AlertTriangle, Check, RotateCcw } from 'lucide-react';
import type { TeamAuctionStandingDto, AuctionLotDto } from './auctionTypes';

interface CorrectionModalProps {
  lot: AuctionLotDto;
  teams: TeamAuctionStandingDto[];
  currencySymbol: string;
  minimumAcquisitionPrice: number;
  onConfirm: (newTeamId: string, newPrice: number, reason: string) => Promise<void>;
  onClose: () => void;
}

export function CorrectionModal({
  lot,
  teams,
  currencySymbol,
  minimumAcquisitionPrice,
  onConfirm,
  onClose
}: CorrectionModalProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(lot.winningTeamId || teams[0]?.teamId || '');
  const [price, setPrice] = useState<number>(lot.finalPrice || lot.basePrice);
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = teams.find(t => t.teamId === selectedTeamId);
  const refund = selectedTeamId === lot.winningTeamId ? lot.finalPrice ?? 0 : 0;
  const squadBefore = (selectedTeam?.currentSquadSize ?? 0) - (selectedTeamId === lot.winningTeamId ? 1 : 0);
  const reserve = Math.max(0, (selectedTeam?.minimumSquadSize ?? 0) - squadBefore - 1) * minimumAcquisitionPrice;
  const maximum = Math.max(0, (selectedTeam?.remainingPurse ?? 0) + refund - reserve);
  const minimum = Math.max(lot.basePrice, minimumAcquisitionPrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeamId) {
      setError('Please select a winning team.');
      return;
    }
    if (!Number.isSafeInteger(price) || price < minimum || price > Math.min(maximum, 10000000000) || squadBefore + 1 > (selectedTeam?.maximumSquadSize ?? 0)) {
      setError(`Choose a whole-number price between ${currencySymbol}${minimum.toLocaleString()} and ${currencySymbol}${maximum.toLocaleString()}, within the team's squad limit.`);
      return;
    }
    if (!reason.trim()) {
      setError('Please provide an audit reason for correcting this result.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedTeamId, price, reason.trim());
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Correction failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div role="dialog" aria-modal="true" aria-label="Correct Auction Result" className="w-full max-w-lg rounded-2xl border border-amber-500/40 bg-[#0e1424] p-6 shadow-2xl space-y-5 text-slate-100">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Correct Auction Result</h3>
              <p className="text-xs text-slate-400">Modify the recorded sale for {lot.playerName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close correction"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-slate-400 text-[11px]">Player:</span>
              <p className="font-bold text-white text-sm">{lot.playerName}</p>
              <p className="text-slate-400 text-[11px]">{lot.position || 'Player'} • Base: {currencySymbol}{lot.basePrice.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <span className="text-slate-400 text-[11px]">Original Sale:</span>
              <p className="font-semibold text-amber-300">
                {lot.winningTeamName || 'Unsold'} • {currencySymbol}{(lot.finalPrice || 0).toLocaleString()}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="correction-team" className="block font-medium text-slate-300 mb-1.5">Correct Winning Team</label>
            <select
              id="correction-team"
              disabled={submitting}
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:ring-2 focus:ring-amber-500 text-xs"
            >
              {teams.map((t) => (
                <option key={t.teamId} value={t.teamId}>
                  {t.teamName} (Purse: {currencySymbol}{t.remainingPurse.toLocaleString()} | Squad: {t.currentSquadSize}/{t.minimumSquadSize})
                </option>
              ))}
            </select>
            {selectedTeam && (
              <p className="mt-1 text-[11px] text-slate-400">
                Maximum correction price for {selectedTeam.teamName}: <strong className="text-emerald-400">{currencySymbol}{maximum.toLocaleString()}</strong> (credits the original sale before recalculating the reserve)
              </p>
            )}
          </div>

          <div>
            <label htmlFor="correction-price" className="block font-medium text-slate-300 mb-1.5">Correct Final Price ({currencySymbol})</label>
            <input
              id="correction-price"
              disabled={submitting}
              type="number"
              min={minimum}
              max={Math.min(maximum, 10000000000)}
              step={1}
              required
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-sm focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label htmlFor="correction-reason" className="block font-medium text-slate-300 mb-1.5">Audit Reason (Required)</label>
            <textarea
              id="correction-reason"
              disabled={submitting}
              maxLength={500}
              required
              rows={2}
              placeholder="e.g., Auctioneer misheard bidding paddle from Falcons FC..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:ring-2 focus:ring-amber-500 text-xs"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold shadow-lg shadow-amber-500/20 inline-flex items-center space-x-1.5 transition"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Applying Correction...' : 'Commit Correction'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
