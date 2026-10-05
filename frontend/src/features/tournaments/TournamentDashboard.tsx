import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Trophy, 
  Plus, 
  Shield, 
  ArrowRight, 
  LogOut, 
  RefreshCw
} from 'lucide-react';
import { NewTournamentModal } from './NewTournamentModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface TournamentSummary {
  id: string;
  name: string;
  slug: string;
  season: string;
  status: string | number;
  userRole: string;
  createdAtUtc: string;
}

export function TournamentDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchTournaments = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTournaments(data);
      }
    } catch (err) {
      console.error('Error fetching tournaments:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTournaments();
  }, [fetchTournaments]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getStatusBadge = (status: string | number) => {
    const s = typeof status === 'number' 
      ? ['DRAFT', 'READY', 'LIVE', 'COMPLETED'][status] || 'DRAFT'
      : status;

    switch (s) {
      case 'LIVE':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 animate-pulse">
            LIVE AUCTION
          </span>
        );
      case 'READY':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            READY
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            COMPLETED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-amber-400 border border-amber-500/30">
            DRAFT
          </span>
        );
    }
  };

  return (
    <div className="league-workspace league-dashboard min-h-screen bg-[#101219] text-slate-100 flex flex-col font-sans">
      {/* Navigation Bar */}
      <header className="border-b border-slate-800 bg-[#171a23]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LeagueHammerBrand /><span className="league-workspace-label">Tournament workspace</span>
          </div>

          <div className="flex items-center space-x-4"><span data-theme-slot />
            <div className="hidden sm:flex items-center space-x-2 text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>{user?.fullName}</span>
              <span className="text-slate-600">({user?.email})</span>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 transition-colors px-3 py-1.5 rounded-lg border border-slate-800 hover:border-rose-500/30"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Top Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Your Tournaments</h1>
            <p className="text-xs text-slate-400 mt-1">
              Select an existing tournament to configure teams and run live auctions.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchTournaments}
              disabled={loading}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Tournament</span>
            </button>
          </div>
        </div>

        {/* Tournaments Grid */}
        {loading && tournaments.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading your tournaments...</p>
          </div>
        ) : tournaments.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 p-8 space-y-4">
            <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No tournaments yet</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Get started by creating your first football tournament. You will automatically become its OWNER.
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create Your First Tournament</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.map((t) => (
              <div
                key={t.id}
                className="group relative rounded-2xl border border-slate-800 bg-[#191d28] p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-900 text-slate-400 border border-slate-800">
                      Season {t.season}
                    </span>
                    {getStatusBadge(t.status)}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-300 transition-colors">
                      {t.name}
                    </h3>
                    <p className="text-xs font-mono text-slate-500 mt-0.5">/live/{t.slug}</p>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2 text-slate-400">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Role: <strong className="text-slate-200">{t.userRole}</strong></span>
                  </div>

                  <Link
                    to={`/tournaments/${t.id}`}
                    className="inline-flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors group-hover:translate-x-0.5"
                  >
                    <span>Manage</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <NewTournamentModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetchTournaments}
      />
    </div>
  );
}
