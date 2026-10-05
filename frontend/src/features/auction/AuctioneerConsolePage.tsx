import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuctionSocket } from './useAuctionSocket';
import { ConnectionIndicator } from './ConnectionIndicator';
import { ShareProjectorLink } from './ShareProjectorLink';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { 
  ArrowLeft, 
  Play, 
  Pause, 
  Gavel, 
  XCircle, 
  RotateCcw, 
  DollarSign, 
  Users, 
  Clock, 
  AlertTriangle, 
  Sparkles, 
  Shield, 
  ChevronRight, 
  Monitor,
  RefreshCw 
} from 'lucide-react';
import type { 
  AuctionStateDto, 
  AuctionLotDto, 
  SetSummaryDto, 
  PlayerSetSummary 
} from './auctionTypes';
import { CorrectionModal } from './CorrectionModal';
import { SetSummaryModal } from './SetSummaryModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function AuctioneerConsolePage() {
  const { id: tournamentId } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  // State
  const [allSets, setAllSets] = useState<PlayerSetSummary[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [bidDraft, setBidDraft] = useState<{ signature: string; price: number; teamId: string } | null>(null);

  // Modals
  const [correctingLot, setCorrectingLot] = useState<AuctionLotDto | null>(null);
  const [showSetSummary, setShowSetSummary] = useState<SetSummaryDto | null>(null);

  const auctionQuery = useQuery({
    queryKey: ['auction', tournamentId, token],
    enabled: !!token && !!tournamentId,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch auction state');
      return await res.json() as AuctionStateDto;
    },
  });
  const state = auctionQuery.data ?? null;
  const membershipQuery = useQuery({
    queryKey: ['auction-membership', tournamentId, token],
    enabled: !!token && !!tournamentId,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load tournament role');
      return await res.json() as { userRole: string };
    },
  });
  // Draft inputs belong to one canonical bid. A remote bid or a new lot immediately replaces them.
  const canonicalBid = state?.currentLot?.currentBid ?? state?.currentLot?.basePrice ?? 0;
  const canonicalLeader = state?.currentLot?.leadingTeamId ?? '';
  const bidSignature = `${state?.currentLot?.lotId ?? ''}:${canonicalBid}:${canonicalLeader}`;
  const currentBidPrice = bidDraft?.signature === bidSignature ? bidDraft.price : canonicalBid;
  const selectedTeamId = bidDraft?.signature === bidSignature ? bidDraft.teamId : canonicalLeader;
  const setSelectedTeamId = (teamId: string) => setBidDraft({ signature: bidSignature, price: currentBidPrice, teamId });
  const setCurrentBidPrice = (price: number | ((previous: number) => number)) => setBidDraft({
    signature: bidSignature, price: typeof price === 'function' ? price(currentBidPrice) : price, teamId: selectedTeamId,
  });
  const lastSoldLot = !state?.currentLot && state?.lastResult?.status === 'SOLD' ? state.lastResult : null;
  const lastSoldEvent = lastSoldLot ? { lot: lastSoldLot, teamName: lastSoldLot.winningTeamName ?? '', finalPrice: lastSoldLot.finalPrice ?? 0 } : null;
  const loading = auctionQuery.isPending;
  const error = auctionQuery.error?.message;
  const { refetch } = auctionQuery;
  const fetchState = useCallback(async () => {
    await refetch({ throwOnError: true });
  }, [refetch]);
  const connectionStatus = useAuctionSocket(tournamentId, token, fetchState, (event, args) => {
    if (event === 'SetCompleted') setShowSetSummary(args[0] as SetSummaryDto);
    if (event === 'PlayerRevealed') setShowSetSummary(null);
  });
  const mutationBlocked = actionLoading || auctionQuery.isError || connectionStatus !== 'connected';
  const currencySymbol = state?.currencySymbol ?? '₹';
  const normalSetFinished = !!state?.currentSetId && !state.isUnsoldRound && state.currentSetSummary?.remainingCount === 0;
  const unsoldRoundFinished = !!state?.isUnsoldRound && state.unsoldRoundRemainingCount === 0;
  const nextNormalSet = allSets.find(set => set.id !== state?.currentSetId && !state?.completedSetIds?.includes(set.id));
  const visibleSetSummary = showSetSummary && (!state?.currentSetId || state.currentSetId === showSetSummary.setId) ? showSetSummary : null;

  // Fetch all sets for the tournament
  const fetchSets = useCallback(async () => {
    if (!token || !tournamentId) return;
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllSets(data);
      }
    } catch {
      // ignore
    }
  }, [token, tournamentId]);

  useEffect(() => {
    fetchSets();
  }, [fetchSets]);

  // Actions
  const handleStartAuction = async () => {
    if (mutationBlocked || !token || !tournamentId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to start auction');
      }
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePauseResume = async () => {
    if (mutationBlocked || !token || !tournamentId || !state) return;
    setActionLoading(true);
    const endpoint = state.sessionStatus === 'LIVE' ? 'pause' : 'resume';
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Action failed');
      }
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartSet = async (setId: string) => {
    if (mutationBlocked || !token || !tournamentId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/start-set`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ setId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to start set');
      }
      setShowSetSummary(null);
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevealNext = async () => {
    if (mutationBlocked || !token || !tournamentId) return;
    if (state?.isUnsoldRound && state.unsoldRoundRemainingCount === 0) return;
    if (!state?.isUnsoldRound && state?.currentSetSummary?.remainingCount === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/reveal-next`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to reveal next player');
      }
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSellCurrent = async () => {
    if (mutationBlocked || !token || !tournamentId || !state?.currentLot || !selectedTeamId) {
      alert('Please select a winning team before confirming sale.');
      return;
    }

    const team = state.teamStandings.find(t => t.teamId === selectedTeamId);
    if (!team) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/sell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          lotId: state.currentLot.lotId,
          winningTeamId: selectedTeamId,
          finalPrice: currentBidPrice
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to sell player');
      }

      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkUnsold = async () => {
    if (mutationBlocked || !token || !tournamentId || !state?.currentLot) return;
    const confirmed = window.confirm(`Mark ${state.currentLot.playerName} as UNSOLD?`);
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/unsold`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lotId: state.currentLot.lotId })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to mark player unsold');
      }

      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteSet = async (setId: string, nextSetId?: string) => {
    if (mutationBlocked || !token || !tournamentId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/sets/${setId}/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to complete set');
      }
      const summary: SetSummaryDto = await res.json();
      setShowSetSummary(summary);
      if (nextSetId) {
        const next = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/start-set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ setId: nextSetId })
        });
        if (!next.ok) {
          const err = await next.json();
          throw new Error(err.detail || 'Set completed, but the next set could not be started');
        }
        setShowSetSummary(null);
      }
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
      await fetchState().catch(() => undefined);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartUnsoldRound = async () => {
    if (mutationBlocked || !token || !tournamentId) return;
    const confirmed = window.confirm(
      state?.sellAllPlayers
        ? 'Start unsold rounds? Remaining unsold players will continue into new rounds until everyone is sold.'
        : 'Start the mandatory Final Unsold Round?\n\nAll players who went unsold in round 1 will be re-auctioned once.'
    );
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/unsold-round/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Failed to start final unsold round');
      }
      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCommitCorrection = async (newTeamId: string, newPrice: number, reason: string) => {
    if (mutationBlocked) throw new Error('Wait for the live connection to synchronize before correcting a result.');
    if (!token || !tournamentId || !correctingLot) return;
    const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/correct-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        lotId: correctingLot.lotId,
        newWinningTeamId: newTeamId,
        newFinalPrice: newPrice,
        reason
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to correct auction result');
    }

    setCorrectingLot(null);
    await fetchState();
  };

  const handleCompleteAuction = async () => {
    if (mutationBlocked || !token || !tournamentId) return;
    const confirmed = window.confirm('Are you sure you want to conclude and complete the entire tournament auction?');
    if (!confirmed) return;

    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });

      if (!res.ok) {
        const err = await res.json();
        if (err.detail && err.detail.includes('explicit override reason') && membershipQuery.data?.userRole === 'OWNER') {
          const override = window.prompt(
            `${err.detail}\n\nEnter an explicit override reason to complete anyway:`
          );
          if (override && override.trim()) {
            const overrideRes = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/complete`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ overrideReason: override.trim() })
            });
            if (overrideRes.ok) {
              await fetchState();
              return;
            }
            throw new Error((await overrideRes.json()).detail || 'Failed to apply owner override');
          }
        }
        throw new Error(err.detail || 'Failed to complete auction');
      }

      await fetchState();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateBid = async () => {
    if (mutationBlocked || !token || !tournamentId || !state?.currentLot) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/auction/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ lotId: state.currentLot.lotId, currentBid: currentBidPrice, leadingTeamId: selectedTeamId || null }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to update live bid');
      await fetchState();
    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to update live bid'); }
    finally { setActionLoading(false); }
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mutationBlocked || correctingLot || visibleSetSummary || state?.sessionStatus !== 'LIVE') return;
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      if (e.key === ' ' || e.key === 'n' || e.key === 'N') {
        if (!state?.currentLot && state?.sessionStatus === 'LIVE') {
          e.preventDefault();
          handleRevealNext();
        }
      } else if (e.key === 'Enter') {
        if (state?.currentLot && selectedTeamId) {
          e.preventDefault();
          handleSellCurrent();
        }
      } else if (e.key === 'u' || e.key === 'U') {
        if (state?.currentLot) {
          e.preventDefault();
          handleMarkUnsold();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state?.currentLot, state?.sessionStatus, selectedTeamId, currentBidPrice, mutationBlocked, correctingLot, visibleSetSummary]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center space-y-3 text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-xs font-mono">Initializing live auction console...</p>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-[#070b14] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-rose-400 text-sm font-semibold">{error || 'Failed to load auction workspace'}</p>
        <button
          onClick={() => navigate(`/tournaments/${tournamentId}`)}
          className="px-4 py-2 rounded-xl bg-slate-800 text-xs text-white hover:bg-slate-700"
        >
          Return to Overview
        </button>
      </div>
    );
  }

  const { currentLot, teamStandings } = state;
  const isLive = state.sessionStatus === 'LIVE';
  const isPaused = state.sessionStatus === 'PAUSED';
  const isCompleted = state.sessionStatus === 'COMPLETED';
  const selectedTeam = teamStandings.find(t => t.teamId === selectedTeamId);

  // Position color mapper
  const getPositionBadge = (pos?: string | null) => {
    switch (pos?.toLowerCase()) {
      case 'forward':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'midfielder':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'defender':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'goalkeeper':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans select-none">
      
      {/* Top Bar Header */}
      <header className="border-b border-slate-800/80 bg-[#0d1321]/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-6 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link
              to={`/tournaments/${tournamentId}`}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Return to Tournament Overview"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link to={`/tournaments/${tournamentId}/auction/history`} className="text-xs text-amber-300 hover:text-white">Auction history</Link>
            <Link to={`/tournaments/${tournamentId}/results`} className="text-xs text-emerald-300 hover:text-white">Results & statistics</Link>

            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Gavel className="w-4 h-4 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                  <span>{state.tournamentName}</span>
                  <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                    Console V1
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400 font-mono">
                  {state.currentSetName || 'Awaiting Set Activation'}
                </p>
              </div>
            </div>
          </div>

          {/* Center Status Pill */}
          <div className="flex items-center gap-3">
            <ConnectionIndicator status={connectionStatus} />
            <Link to={`/tournaments/${tournamentId}/projector`} target="_blank" rel="noopener noreferrer" title="Open projector view" className="text-emerald-300 flex items-center gap-2 text-xs"><Monitor size={18} />Projector</Link>
            <ShareProjectorLink tournamentId={tournamentId!} />
          </div>
          <div className="flex items-center space-x-2">
            <span className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              isLive 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10 animate-pulse'
                : isPaused
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : isCompleted
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}>
              <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400' : isPaused ? 'bg-amber-400' : 'bg-slate-400'}`} />
              <span>{state.sessionStatus}</span>
            </span>

            {state.sessionStatus === 'READY' && (
              <button
                onClick={handleStartAuction}
                disabled={mutationBlocked}
                className="px-4 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition cursor-pointer"
              >
                Launch Auction
              </button>
            )}

            {(isLive || isPaused) && (
              <button
                onClick={handlePauseResume}
                disabled={mutationBlocked}
                className={`p-1.5 rounded-xl border text-xs font-semibold transition ${
                  isLive
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                }`}
                title={isLive ? 'Pause Live Auction' : 'Resume Live Auction'}
              >
                {isLive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Right Progress Indicators */}
          <div className="hidden lg:flex items-center space-x-6 text-xs text-slate-400">
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Tournament Progress</span>
              <p className="font-bold text-white font-mono">
                {state.totalSoldPlayersCount} Sold • {state.totalUnsoldPlayersCount} Unsold / {state.totalPlayersCount} Total
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Total Spent</span>
              <p className="font-black text-emerald-400 font-mono">
                {currencySymbol}{state.totalSpentAcrossTournament.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="bg-amber-950/60 border-b border-amber-500/30 px-6 py-3 text-sm text-amber-200">Auction state could not be refreshed. Controls are paused while the connection recovers.</p>}

      {/* Main Container */}
      <fieldset disabled={mutationBlocked || state.sessionStatus === 'PAUSED'} className="contents">
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Stage: Podium & Bidding Console (8 Cols) */}
        <section className="lg:col-span-8 flex flex-col space-y-6">

          {/* Stage 1: Active Player on Podium */}
          {currentLot ? (
            <div className="rounded-3xl border border-slate-800 bg-[#0d1321] p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col justify-between flex-1">
              
              {/* Top Meta */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
                    Lot #{currentLot.drawPosition}
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    {currentLot.playerSetName} {currentLot.attemptNumber > 1 && `(Round ${currentLot.attemptNumber})`}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    ON AUCTION PODIUM
                  </span>
                </div>
              </div>

              {/* Main Player Display */}
              <div className="py-6 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                {/* Photo / Avatar */}
                <div className="sm:col-span-5 flex flex-col items-center">
                  <div className="w-48 h-56 sm:w-52 sm:h-64 rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-slate-700/80 p-2 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden group">
                    {currentLot.photoUrl ? (
                      <img
                        src={currentLot.photoUrl}
                        alt={currentLot.playerName}
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-2 text-slate-500">
                        <Users className="w-16 h-16 text-slate-600" />
                        <span className="text-[11px] font-mono text-slate-500">NO PHOTO UPLOADED</span>
                      </div>
                    )}
                    {currentLot.jerseyNumber && (
                      <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-950/90 border border-slate-700 flex items-center justify-center font-black text-xs text-white shadow">
                        #{currentLot.jerseyNumber}
                      </div>
                    )}
                  </div>
                </div>

                {/* Player Credentials & Base Price Spotlight */}
                <div className="sm:col-span-7 space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${getPositionBadge(currentLot.position)}`}>
                        {currentLot.position || 'Player'}
                      </span>
                      {currentLot.preferredFoot && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {currentLot.preferredFoot} Foot
                        </span>
                      )}
                      {currentLot.age && (
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                          {currentLot.age} Yrs
                        </span>
                      )}
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                      {currentLot.playerName}
                    </h2>
                    {currentLot.previousTeam && (
                      <p className="text-xs text-slate-400 font-medium">
                        Prior Club: <span className="text-slate-200">{currentLot.previousTeam}</span>
                      </p>
                    )}
                    {currentLot.shortBio && (
                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed italic">
                        "{currentLot.shortBio}"
                      </p>
                    )}
                  </div>

                  {/* Base Price Spotlight */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-slate-900/60 to-transparent border border-emerald-500/30 flex items-baseline justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-emerald-400 font-bold">
                        Base Price Floor
                      </span>
                      <p className="text-2xl sm:text-3xl font-black text-white font-mono">
                        {currencySymbol}{currentLot.basePrice.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400 font-mono">
                      Min Bid: {currencySymbol}{currentLot.basePrice.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Bidding Control Panel */}
              <div className="space-y-5 pt-4 border-t border-slate-800/80">
                
                {/* 1. Team Selector Grid */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-bold text-slate-300 flex items-center space-x-1.5">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      <span>Select Winning Franchise</span>
                    </label>
                    {selectedTeam && (
                      <span className="text-[11px] text-slate-400">
                        {state.sellAllPlayers ? 'Team purse limit' : 'Max Allowed Bid'}: <strong className="text-emerald-400 font-mono">{currencySymbol}{selectedTeam.maximumAllowedBid.toLocaleString()}</strong>
                      </span>
                    )}
                  </div>

                  {state.sellAllPlayers && <p className="text-xs text-amber-300">Purchases must leave enough money and squad spaces for all remaining players at their base prices. The team purse limit alone does not guarantee a bid can be accepted.</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {teamStandings.map((t) => {
                      const isSelected = t.teamId === selectedTeamId;
                      const canAfford = t.canBid && t.maximumAllowedBid >= currentBidPrice;

                      return (
                        <button
                          key={t.teamId}
                          type="button"
                          onClick={() => setSelectedTeamId(t.teamId)}
                          className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden ${
                            isSelected
                              ? 'border-emerald-400 bg-emerald-950/40 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                              : canAfford
                                ? 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                                : 'border-rose-950/40 bg-rose-950/10 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div 
                            className="absolute top-0 left-0 bottom-0 w-1.5"
                            style={{ backgroundColor: t.primaryColor || '#10b981' }}
                          />
                          <div className="pl-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-white truncate max-w-[120px]">{t.teamName}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-300">
                                {t.shortName}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
                              <span>Purse:</span>
                              <span className="font-bold text-slate-200">{currencySymbol}{t.remainingPurse.toLocaleString()}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center justify-between">
                              <span>Squad:</span>
                              <span className="font-semibold text-slate-300">{t.currentSquadSize} / {t.minimumSquadSize}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Final Price Input & Increments */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                      <DollarSign className="w-4 h-4 text-amber-400" />
                      <span>Winning Bid Price ({currencySymbol})</span>
                    </label>

                    {/* Quick increment chips */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setCurrentBidPrice(currentLot.basePrice)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-[11px]"
                      >
                        Reset (Base)
                      </button>
                      {[1, 2, 5, 10, 50].map(multiplier => { const inc = multiplier * state.defaultBidIncrement; return (
                        <button
                          key={inc}
                          type="button"
                          onClick={() => setCurrentBidPrice(prev => prev + inc)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-emerald-500/20 hover:text-emerald-300 border border-slate-700 text-slate-300 font-mono text-[11px] transition"
                        >
                          +{currencySymbol}{inc}
                        </button>
                      ); })}
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-slate-500">
                      {currencySymbol}
                    </span>
                    <input
                      aria-label="Winning bid price"
                      type="number"
                      step={state.defaultBidIncrement}
                      min={currentLot.basePrice}
                      value={currentBidPrice}
                      onChange={(e) => setCurrentBidPrice(Number(e.target.value))}
                      className="w-full pl-9 pr-4 py-3 rounded-2xl bg-slate-900 border border-slate-700 text-white font-mono font-black text-2xl focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                    />
                  </div>

                  <button type="button" onClick={handleUpdateBid} disabled={mutationBlocked || !Number.isSafeInteger(currentBidPrice) || currentBidPrice < currentLot.basePrice} className="rounded-xl bg-sky-500/20 border border-sky-400/40 px-4 py-2 text-sm font-bold text-sky-200">Update Live Bid</button>
                  <p className="text-xs text-slate-400">Record the current floor bid to show it on every live screen.</p>

                  {/* Affordability check alert */}
                  {selectedTeam && currentBidPrice > selectedTeam.maximumAllowedBid && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2 animate-shake">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>
                        Bid exceeds {selectedTeam.teamName}'s maximum purchase limit of {currencySymbol}{selectedTeam.maximumAllowedBid.toLocaleString()} (squad reserve floor).
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Action Buttons (SOLD / UNSOLD) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <button
                    type="button"
                    onClick={handleSellCurrent}
                    disabled={mutationBlocked || !selectedTeamId || (selectedTeam ? currentBidPrice > selectedTeam.maximumAllowedBid : false)}
                    className="py-4 px-6 rounded-2xl bg-emerald-400 hover:bg-emerald-300 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/25 flex items-center justify-center space-x-2 transition cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Gavel className="w-5 h-5 stroke-[2.5]" />
                    <span>SOLD TO {selectedTeam?.shortName || 'TEAM'} [ENTER]</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleMarkUnsold}
                    disabled={mutationBlocked}
                    className="py-4 px-6 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-sm flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                    <span>MARK UNSOLD [U]</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Stage 2: Empty Podium / Set Selection / Reveal Next */
            <div className="rounded-3xl border border-slate-800 bg-[#0d1321] p-8 sm:p-12 shadow-2xl flex flex-col items-center justify-center text-center space-y-6 flex-1 min-h-[500px]">
              
              {/* If a player was just sold, show confirmation banner */}
              {lastSoldEvent && (
                <div className="w-full max-w-lg p-5 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-slate-900 to-emerald-500/10 border border-emerald-500/40 animate-fade-in space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                    Latest Resolved Lot
                  </span>
                  <h3 className="text-xl font-black text-white">{lastSoldEvent.lot.playerName} SOLD!</h3>
                  <p className="text-xs text-slate-300">
                    Acquired by <strong className="text-emerald-300">{lastSoldEvent.teamName}</strong> for <strong className="text-white font-mono">{currencySymbol}{lastSoldEvent.finalPrice.toLocaleString()}</strong>
                  </p>
                </div>
              )}

              <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-xl">
                <Gavel className="w-10 h-10 text-emerald-400" />
              </div>

              <div className="space-y-2 max-w-md">
                <h3 className="text-2xl font-black text-white">{normalSetFinished ? 'All players in this set are done' : unsoldRoundFinished ? 'All players in this round are done' : 'Auction Podium Ready'}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {normalSetFinished
                    ? `${state.currentSetName}: ${state.currentSetSummary?.soldCount} sold, ${state.currentSetSummary?.unsoldCount} unsold. ${nextNormalSet ? 'Go to the next set when you are ready, or review this set summary.' : 'Complete this set to continue to unsold rounds or auction completion.'}`
                    : unsoldRoundFinished ? 'Every player in this round has been resolved. You can now complete the auction.'
                    : state.currentSetId || state.isUnsoldRound
                    ? `Active Set: ${state.currentSetName || 'Final Unsold Round'}. Reveal the next randomized player to start bidding.`
                    : 'Select a player set to activate the randomized auction draw.'}
                </p>
              </div>

              {/* Actions depending on state */}
              {state.currentSetId || state.isUnsoldRound ? (
                <div className="space-y-3 w-full max-w-sm">
                  {!normalSetFinished && !unsoldRoundFinished && <button
                    onClick={handleRevealNext}
                    disabled={mutationBlocked || (state.isUnsoldRound ? state.unsoldRoundRemainingCount === 0 : state.currentSetSummary?.remainingCount === 0)}
                    className="w-full py-4 px-6 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-black text-base shadow-xl shadow-emerald-500/25 flex items-center justify-center space-x-2 transition cursor-pointer transform hover:-translate-y-0.5"
                  >
                    <Sparkles className="w-5 h-5" />
                    <span>REVEAL NEXT PLAYER [SPACE / N]</span>
                  </button>}

                  {normalSetFinished && nextNormalSet && <button
                    onClick={() => handleCompleteSet(state.currentSetId!, nextNormalSet.id)}
                    disabled={mutationBlocked}
                    className="w-full py-4 px-6 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    Go to Next Set: {nextNormalSet.name}<ChevronRight className="w-5 h-5" />
                  </button>}

                  {state.currentSetId && (
                    <button
                      onClick={() => handleCompleteSet(state.currentSetId!)}
                      disabled={mutationBlocked || state.currentSetSummary?.remainingCount !== 0}
                      className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 border border-slate-700 transition"
                    >
                      Complete Active Set
                    </button>
                  )}
                  {state.isUnsoldRound && state.unsoldRoundRemainingCount === 0 && (
                    <button onClick={handleCompleteAuction} disabled={mutationBlocked} className="w-full p-4 rounded-xl bg-purple-500/20 text-purple-300 font-bold">
                      Conclude & Complete Tournament Auction
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4 w-full max-w-sm">
                  {/* Start Next Set Picker */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-slate-300">Choose Player Set to Launch:</span>
                    <div className="grid grid-cols-1 gap-2">
                      {allSets.filter(s => !state.completedSetIds?.includes(s.id)).slice(0, 1).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleStartSet(s.id)}
                          disabled={mutationBlocked}
                          className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between text-xs transition"
                        >
                          <div>
                            <span className="font-bold text-white">{s.name}</span>
                            <span className="text-slate-400 text-[11px] block">{s.description || 'Ordered Player Set'}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-emerald-400" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Or Final Unsold Round */}
                  {state.totalUnsoldPlayersCount > 0 && !state.isUnsoldRound && state.completedSetsCount === state.totalSetsCount && (
                    <button
                      onClick={handleStartUnsoldRound}
                      disabled={mutationBlocked}
                      className="w-full py-3 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition"
                    >
                      {state.sellAllPlayers ? 'Launch Unsold Rounds' : 'Launch Mandatory Final Unsold Round'} ({state.totalUnsoldPlayersCount} Players)
                    </button>
                  )}

                  {/* Or Complete Auction */}
                  <button
                    onClick={handleCompleteAuction}
                    disabled={mutationBlocked}
                    className="w-full py-3 px-4 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold transition"
                  >
                    Conclude & Complete Tournament Auction
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Stage: Team Standings & Financial Purse Tracker (4 Cols) */}
        <aside className="lg:col-span-4 flex flex-col space-y-6">
          <div className="rounded-3xl border border-slate-800 bg-[#0d1321] p-5 shadow-2xl space-y-4 flex flex-col flex-1">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-300">
                  Franchise Purse Tracker
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{teamStandings.length} Teams</span>
            </div>

            {/* Standings List */}
            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {teamStandings.map((team) => {
                const isSelected = team.teamId === selectedTeamId;
                const squadPercent = Math.min(100, Math.round((team.currentSquadSize / team.minimumSquadSize) * 100));

                return (
                  <div
                    key={team.teamId}
                    onClick={() => setSelectedTeamId(team.teamId)}
                    className={`cursor-pointer p-3.5 rounded-2xl border transition-all ${
                      isSelected
                        ? 'border-emerald-500/60 bg-[#121c2e] shadow-md shadow-emerald-500/10'
                        : 'border-slate-800/80 bg-slate-900/60 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: team.primaryColor || '#10b981' }} 
                        />
                        <h4 className="font-bold text-xs text-white">{team.teamName}</h4>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                        {team.shortName}
                      </span>
                    </div>

                    {/* Purse & Max Bid */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-2.5">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Remaining Purse</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {currencySymbol}{team.remainingPurse.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Max Allowed Bid</span>
                        <span className="font-mono font-bold text-amber-300">
                          {currencySymbol}{team.maximumAllowedBid.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Squad Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>Squad: <strong className="text-white">{team.currentSquadSize}</strong> / {team.minimumSquadSize} (Max {team.maximumSquadSize})</span>
                        <span>{squadPercent}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                          style={{ width: `${squadPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions Footer */}
            <div className="pt-3 border-t border-slate-800 text-xs flex justify-between items-center text-slate-400">
              <span className="flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Audited Engine V1</span>
              </span>

              {lastSoldEvent && (
                <button
                  onClick={() => setCorrectingLot(lastSoldEvent.lot)}
                  className="inline-flex items-center space-x-1 text-amber-400 hover:text-amber-300 font-semibold"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Correct Last Sale</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      </main>
      </fieldset>

      {/* Modals */}
      {correctingLot && (
        <CorrectionModal
          lot={correctingLot}
          teams={teamStandings}
          currencySymbol={currencySymbol}
          minimumAcquisitionPrice={state.minimumAcquisitionPrice}
          onConfirm={handleCommitCorrection}
          onClose={() => setCorrectingLot(null)}
        />
      )}

      {visibleSetSummary && (
        <SetSummaryModal
          summary={visibleSetSummary}
          currencySymbol={currencySymbol}
          allSets={allSets}
          onStartSet={handleStartSet}
          onClose={() => setShowSetSummary(null)}
        />
      )}
    </div>
  );
}
