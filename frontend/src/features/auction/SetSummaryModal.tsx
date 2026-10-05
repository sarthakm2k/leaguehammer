import { Trophy, CheckCircle, ArrowRight, X, TrendingUp } from 'lucide-react';
import type { SetSummaryDto, PlayerSetSummary } from './auctionTypes';

interface SetSummaryModalProps {
  summary: SetSummaryDto;
  currencySymbol: string;
  allSets: PlayerSetSummary[];
  onStartSet: (setId: string) => Promise<void>;
  onClose: () => void;
}

export function SetSummaryModal({
  summary,
  currencySymbol,
  allSets,
  onStartSet,
  onClose
}: SetSummaryModalProps) {
  // Find sets that haven't been completed or the next set in order
  const currentSetIndex = allSets.findIndex(s => s.id === summary.setId);
  const nextSet = currentSetIndex >= 0 && currentSetIndex + 1 < allSets.length ? allSets[currentSetIndex + 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div role="dialog" aria-modal="true" aria-label="Set summary" className="w-full max-w-xl rounded-3xl border border-emerald-500/40 bg-gradient-to-b from-[#0f172a] to-[#101219] p-6 sm:p-8 shadow-2xl space-y-6 text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Trophy className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                Set Completed Successfully
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">{summary.setName}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close set summary"
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400">Total In Set</span>
            <p className="text-2xl font-black text-white mt-1">{summary.totalPlayersInSet}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-[11px] text-emerald-400">Players Sold</span>
            <p className="text-2xl font-black text-emerald-300 mt-1">{summary.soldCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <span className="text-[11px] text-amber-400">Unsold</span>
            <p className="text-2xl font-black text-amber-300 mt-1">{summary.unsoldCount}</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            <span className="text-[11px] text-slate-400">Total Spent</span>
            <p className="text-lg font-black text-white mt-1.5 font-mono">
              {currencySymbol}{summary.totalSpentInSet.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Top Buy Spotlight */}
        {summary.highestPlayerName && (
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-transparent p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400">Highest Purchase in Set</span>
                <h4 className="font-bold text-sm text-white">{summary.highestPlayerName}</h4>
                <p className="text-xs text-slate-400">Acquired by <span className="text-slate-200 font-semibold">{summary.highestTeamName}</span></p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-amber-300 font-mono">
                {currencySymbol}{(summary.highestPrice || 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
          >
            Review Auction Podium
          </button>

          {nextSet ? (
            <button
              onClick={() => onStartSet(nextSet.id)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/25 inline-flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <span>Start Next Set: {nextSet.name}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-bold inline-flex items-center justify-center space-x-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>All Sets Finished</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
