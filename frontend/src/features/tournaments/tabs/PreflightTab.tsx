import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RefreshCw, 
  Lock, 
  Unlock, 
  ShieldCheck, 
  Users, 
  DollarSign, 
  Layers, 
  UserCheck, 
  ArrowRight,
  Sparkles,
  HelpCircle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface PreflightCheckItem {
  key: string;
  category: string; // "Settings", "Teams", "Sets", "Players", "Feasibility"
  title: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  fixHint?: string | null;
}

export interface PreflightMetrics {
  totalTeams: number;
  minimumSquadSize: number;
  maximumSquadSize: number;
  requiredPlayersForMinSquad: number;
  totalPlayers: number;
  totalSets: number;
  emptySetsCount: number;
  minimumAcquisitionPrice: number;
  minimumPurseRequiredPerTeam: number;
  totalPurseAcrossTeams: number;
  playersWithoutPhotosCount: number;
}

export interface PreflightReportDto {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  isReadyForAuction: boolean;
  criticalErrorsCount: number;
  warningsCount: number;
  metrics: PreflightMetrics;
  checks: PreflightCheckItem[];
  blockingErrors: string[];
  warnings: string[];
}

interface PreflightTabProps {
  tournamentId: string;
  isOwner: boolean;
  onStatusChange?: (newStatus: string) => void;
  onNavigateTab?: (tab: 'settings' | 'teams' | 'tiers' | 'sets' | 'players') => void;
}

export function PreflightTab({
  tournamentId,
  isOwner,
  onStatusChange,
  onNavigateTab
}: PreflightTabProps) {
  const { token } = useAuth();
  const [report, setReport] = useState<PreflightReportDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'issues' | 'passed'>('all');

  const fetchPreflight = useCallback(async (isRefresh = false) => {
    if (!token || !tournamentId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/preflight`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to load preflight validation report');
      }
      const data: PreflightReportDto = await res.json();
      setReport(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching preflight report');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, tournamentId]);

  useEffect(() => {
    fetchPreflight();
  }, [fetchPreflight]);

  const handleApproveReady = async () => {
    if (!token || !tournamentId) return;
    const confirmed = window.confirm(
      'Are you sure you want to mark this tournament READY FOR AUCTION?\n\n' +
      'This locks tournament configurations and enables launch of the live auction.'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/preflight/approve-ready`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.message || 'Approval failed');
      }

      await fetchPreflight(true);
      if (onStatusChange) {
        onStatusChange('READY');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to approve tournament readiness');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToDraft = async () => {
    if (!token || !tournamentId) return;
    const confirmed = window.confirm(
      'Return this tournament to DRAFT status?\n\n' +
      'This unlocks configurations so you can modify rules, teams, and players.'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/preflight/return-to-draft`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || data.message || 'Return to draft failed');
      }

      await fetchPreflight(true);
      if (onStatusChange) {
        onStatusChange('DRAFT');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to return to draft');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-3 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
        <p className="text-xs">Running preflight validation algorithms...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-center space-y-3">
        <p className="text-sm font-semibold text-rose-300">{error || 'Unable to calculate preflight status'}</p>
        <button
          onClick={() => fetchPreflight()}
          className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-white hover:bg-slate-700 inline-flex items-center space-x-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Validation</span>
        </button>
      </div>
    );
  }

  const { metrics, checks } = report;
  const isReady = report.tournamentStatus === 'READY';
  const isDraft = report.tournamentStatus === 'DRAFT';
  const passedChecksCount = checks.filter(c => c.status === 'PASS').length;
  const shortfall = Math.max(0, metrics.requiredPlayersForMinSquad - metrics.totalPlayers);

  // Filtering
  const filteredChecks = checks.filter(c => {
    if (categoryFilter !== 'all' && c.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return false;
    }
    if (statusFilter === 'issues') {
      return c.status !== 'PASS';
    }
    if (statusFilter === 'passed') {
      return c.status === 'PASS';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Hero Banner */}
      <div data-preflight-state={isReady ? 'ready' : report.isReadyForAuction ? 'eligible' : 'blocked'} className={`preflight-hero rounded-2xl border p-6 shadow-xl relative overflow-hidden transition-all ${
        isReady
          ? 'bg-gradient-to-r from-emerald-950/60 via-[#0d1726] to-[#101219] border-emerald-500/40'
          : report.isReadyForAuction
            ? 'bg-gradient-to-r from-teal-950/50 via-[#0d1726] to-[#101219] border-teal-500/40'
            : 'bg-gradient-to-r from-rose-950/50 via-[#0d1726] to-[#101219] border-rose-500/40'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                isReady
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : report.isReadyForAuction
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }`}>
                {isReady ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>LOCKED & READY FOR AUCTION</span>
                  </>
                ) : report.isReadyForAuction ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>PREFLIGHT PASSED — ELIGIBLE FOR AUCTION</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>PREFLIGHT BLOCKED ({report.criticalErrorsCount} ISSUE{report.criticalErrorsCount > 1 ? 'S' : ''})</span>
                  </>
                )}
              </span>

              <span className="text-xs text-slate-400 font-mono">
                Status: <strong className="text-white">{report.tournamentStatus}</strong>
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {isReady
                ? 'Tournament is Locked & Ready for Live Auction'
                : report.isReadyForAuction
                  ? 'All Mandatory Preflight Requirements Satisfied'
                  : 'Preflight Feasibility Checks Require Resolution'}
            </h2>

            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              {isReady
                ? 'All configurations, rosters, and financial guardrails are locked. You can safely launch the live auction console when your event commences.'
                : report.isReadyForAuction
                  ? 'Every team meets minimum squad requirements, purse floors are mathematically balanced, and roster pools are sufficient. You may now lock this tournament.'
                  : 'The tournament cannot begin until all blocking issues (marked with a red cross) are resolved. Review the checklist below for specific instructions and quick actions.'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => fetchPreflight(true)}
              disabled={refreshing}
              className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
              title="Re-run preflight checks"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Checking...' : 'Re-check'}</span>
            </button>

            {isOwner && isDraft && (
              <button
                onClick={handleApproveReady}
                disabled={!report.isReadyForAuction || actionLoading}
                className={`inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all ${
                  report.isReadyForAuction && !actionLoading
                    ? 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-emerald-500/25 cursor-pointer transform hover:-translate-y-0.5'
                    : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{actionLoading ? 'Locking...' : 'Lock & Mark Ready for Auction'}</span>
              </button>
            )}

            {isOwner && isReady && (
              <button
                onClick={handleReturnToDraft}
                disabled={actionLoading}
                className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>{actionLoading ? 'Updating...' : 'Return to Draft'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Status mini bar */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-slate-400">Total Checks:</span>
            <p className="font-bold text-white text-sm">{checks.length}</p>
          </div>
          <div>
            <span className="text-emerald-400">Checks Passed:</span>
            <p className="font-bold text-emerald-300 text-sm">{passedChecksCount}</p>
          </div>
          <div>
            <span className="text-amber-400">Warnings (Non-blocking):</span>
            <p className="font-bold text-amber-300 text-sm">{report.warningsCount}</p>
          </div>
          <div>
            <span className="text-rose-400">Blocking Failures:</span>
            <p className="font-bold text-rose-400 text-sm">{report.criticalErrorsCount}</p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Teams & Squad Math */}
        <div className="rounded-xl border border-slate-800 bg-[#191d28] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Teams & Squad Limit</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white">{metrics.totalTeams}</span>
            <span className="text-xs text-slate-400">registered teams</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Squad target: <strong className="text-slate-200">{metrics.minimumSquadSize} - {metrics.maximumSquadSize}</strong> players/team
          </p>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('teams')}
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 inline-flex items-center space-x-1 pt-1"
            >
              <span>Manage teams</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Metric 2: Roster Feasibility Math */}
        <div className={`rounded-xl border p-4 space-y-2 ${
          shortfall > 0 
            ? 'border-rose-500/40 bg-rose-950/20' 
            : 'border-slate-800 bg-[#191d28]'
        }`}>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Roster Feasibility</span>
            <UserCheck className={`w-4 h-4 ${shortfall > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className={`text-2xl font-black ${shortfall > 0 ? 'text-rose-400' : 'text-white'}`}>
              {metrics.totalPlayers}
            </span>
            <span className="text-xs text-slate-400">/ {metrics.requiredPlayersForMinSquad} min required</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {shortfall > 0 ? (
              <span className="text-rose-400 font-semibold">Shortfall of {shortfall} players</span>
            ) : (
              <span className="text-emerald-400 font-medium">Pool satisfies minimum squad demand</span>
            )}
          </p>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('players')}
              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 inline-flex items-center space-x-1 pt-1"
            >
              <span>Roster Registry</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Metric 3: Financial Floor */}
        <div className="rounded-xl border border-slate-800 bg-[#191d28] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Financial Reserve Floor</span>
            <DollarSign className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white">₹{metrics.minimumPurseRequiredPerTeam.toLocaleString()}</span>
            <span className="text-xs text-slate-400">min purse/team</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Floor: {metrics.minimumSquadSize} slots × ₹{metrics.minimumAcquisitionPrice} min bid
          </p>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('settings')}
              className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 inline-flex items-center space-x-1 pt-1"
            >
              <span>Auction Rules</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Metric 4: Sets & Photos */}
        <div className="rounded-xl border border-slate-800 bg-[#191d28] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Sets & Media</span>
            <Layers className="w-4 h-4 text-purple-400" />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white">{metrics.totalSets}</span>
            <span className="text-xs text-slate-400">sets ({metrics.emptySetsCount} empty)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            {metrics.playersWithoutPhotosCount > 0 ? (
              <span className="text-amber-400">{metrics.playersWithoutPhotosCount} players missing photo (warning)</span>
            ) : (
              <span className="text-emerald-400">All players have photos</span>
            )}
          </p>
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab('sets')}
              className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 inline-flex items-center space-x-1 pt-1"
            >
              <span>Organize sets</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Filter and Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-white">Preflight Validation Checklist</h3>
          <span className="text-xs text-slate-400 font-mono">({filteredChecks.length} checks displayed)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'all' ? 'bg-slate-800 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('issues')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'issues' ? 'bg-rose-500/20 text-rose-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Issues Only
            </button>
            <button
              onClick={() => setStatusFilter('passed')}
              className={`px-2.5 py-1 rounded-md transition ${
                statusFilter === 'passed' ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Passed
            </button>
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-xs focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">All Categories</option>
            <option value="Settings">Settings</option>
            <option value="Teams">Teams</option>
            <option value="Sets">Sets</option>
            <option value="Players">Players</option>
            <option value="Feasibility">Feasibility</option>
          </select>
        </div>
      </div>

      {/* Checks List */}
      <div className="space-y-3">
        {filteredChecks.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-slate-800 bg-[#191d28] text-xs text-slate-400">
            No preflight checks match your current filter selection.
          </div>
        ) : (
          filteredChecks.map((item) => {
            const isSuccess = item.status === 'PASS';
            const isWarning = item.status === 'WARN';
            const isFailure = item.status === 'FAIL';

            return (
              <div
                key={item.key}
                className={`rounded-xl border p-4 transition-all ${
                  isFailure
                    ? 'border-rose-500/40 bg-[#160c12]'
                    : isWarning
                      ? 'border-amber-500/30 bg-[#17130b]'
                      : 'border-slate-800/80 bg-[#191d28] hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start space-x-3.5">
                    <div className="mt-0.5">
                      {isFailure && <XCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />}
                      {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />}
                      {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-bold text-white">{item.title}</h4>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {item.category}
                        </span>
                        {isFailure && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            BLOCKING
                          </span>
                        )}
                        {isWarning && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            WARNING
                          </span>
                        )}
                      </div>

                      <p className={`text-xs ${
                        isFailure ? 'text-rose-200' : isWarning ? 'text-amber-200' : 'text-slate-300'
                      }`}>
                        {item.message}
                      </p>

                      {item.fixHint && (
                        <div className="mt-2 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300 flex items-start space-x-2">
                          <HelpCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold text-emerald-400">Action Required: </span>
                            <span>{item.fixHint}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Navigation shortcut to relevant tab */}
                  {onNavigateTab && (
                    <div className="flex-shrink-0">
                      {item.category === 'Settings' && (
                        <button
                          onClick={() => onNavigateTab('settings')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 transition"
                        >
                          Rules →
                        </button>
                      )}
                      {item.category === 'Teams' && (
                        <button
                          onClick={() => onNavigateTab('teams')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 transition"
                        >
                          Teams →
                        </button>
                      )}
                      {item.category === 'Sets' && (
                        <button
                          onClick={() => onNavigateTab('sets')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 transition"
                        >
                          Sets →
                        </button>
                      )}
                      {(item.category === 'Players' || item.category === 'Feasibility') && (
                        <button
                          onClick={() => onNavigateTab('players')}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-slate-300 hover:text-white border border-slate-700 transition"
                        >
                          Players →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
