import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { 
  Trophy, 
  ArrowLeft, 
  Shield, 
  MapPin, 
  Globe, 
  Calendar, 
  Edit,
  Users,
  Layers,
  CheckCircle,
  Play,
  Sliders,
  Tag,
  LayoutDashboard
} from 'lucide-react';
import { TournamentSettingsTab } from './tabs/TournamentSettingsTab';
import { TeamsTab } from './tabs/TeamsTab';
import { BasePriceTiersTab } from './tabs/BasePriceTiersTab';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

interface TournamentDetail {
  id: string;
  name: string;
  slug: string;
  season: string;
  description: string | null;
  logoUrl: string | null;
  tournamentDate: string | null;
  location: string | null;
  timeZone: string;
  status: string | number;
  ownerUserId: string;
  userRole: string;
  createdAtUtc: string;
  updatedAtUtc: string | null;
}

export function TournamentOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const navigate = useNavigate();

  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings' | 'teams' | 'tiers'>('overview');

  // Edit State
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSeason, setEditSeason] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const fetchTournament = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTournament(data);
        setEditName(data.name);
        setEditSeason(data.season);
        setEditLocation(data.location || '');
        setEditDescription(data.description || '');
      } else {
        setError('Tournament not found or unauthorized.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error fetching tournament');
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    fetchTournament();
  }, [fetchTournament]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !id) return;
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          season: editSeason,
          location: editLocation,
          description: editDescription,
          timeZone: tournament?.timeZone || 'Asia/Kolkata'
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Update failed');
      }

      const updated = await res.json();
      setTournament(updated);
      setEditing(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const getStatusString = (status: string | number | undefined) => {
    if (typeof status === 'number') {
      return ['DRAFT', 'READY', 'LIVE', 'COMPLETED'][status] || 'DRAFT';
    }
    return status || 'DRAFT';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-400 text-xs">
        Loading tournament workspace...
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center p-4 space-y-4 text-center">
        <p className="text-rose-400 text-sm">{error || 'Tournament not found.'}</p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-white hover:bg-slate-700"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const isOwner = tournament.userRole === 'OWNER';
  const statusStr = getStatusString(tournament.status);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0d1321]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/dashboard"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Trophy className="w-5 h-5 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="font-bold text-base text-white">{tournament.name}</h1>
                <p className="text-[11px] font-mono text-slate-400">/live/{tournament.slug}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>{tournament.userRole}</span>
            </span>

            {isOwner && (
              <button
                onClick={() => setEditing(!editing)}
                className="inline-flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white transition-colors"
              >
                <Edit className="w-3.5 h-3.5" />
                <span>{editing ? 'Cancel Edit' : 'Edit Details'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 border-t border-slate-800/60 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`inline-flex items-center space-x-2 py-3 px-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`inline-flex items-center space-x-2 py-3 px-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Auction Rules & Purse</span>
          </button>

          <button
            onClick={() => setActiveTab('teams')}
            className={`inline-flex items-center space-x-2 py-3 px-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'teams'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Participating Teams</span>
          </button>

          <button
            onClick={() => setActiveTab('tiers')}
            className={`inline-flex items-center space-x-2 py-3 px-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === 'tiers'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Base Price Tiers</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        
        {/* Banner */}
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-b from-[#0e1424] to-[#090d16] p-6 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-3">
                <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Season {tournament.season}
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-800 text-amber-400 border border-amber-500/30">
                  {statusStr}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">{tournament.name}</h2>
              {tournament.description && (
                <p className="text-xs text-slate-400 max-w-2xl">{tournament.description}</p>
              )}
            </div>

            <div className="flex flex-col sm:items-end space-y-1.5 text-xs text-slate-400">
              {tournament.location && (
                <div className="flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{tournament.location}</span>
                </div>
              )}
              <div className="flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>{tournament.timeZone}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>Created {new Date(tournament.createdAtUtc).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Edit Form (if toggled) */}
        {editing && (
          <div className="rounded-2xl border border-emerald-500/30 bg-[#0e1424] p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white">Edit Tournament Information</h3>
            <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Tournament Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Season</label>
                <input
                  type="text"
                  required
                  value={editSeason}
                  onChange={(e) => setEditSeason(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Location</label>
                <input
                  type="text"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end space-x-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'settings' && (
          <TournamentSettingsTab
            tournamentId={tournament.id}
            isOwner={isOwner}
            status={statusStr}
          />
        )}

        {activeTab === 'teams' && (
          <TeamsTab
            tournamentId={tournament.id}
            isOwner={isOwner}
            status={statusStr}
            defaultPurse={100000}
          />
        )}

        {activeTab === 'tiers' && (
          <BasePriceTiersTab
            tournamentId={tournament.id}
            isOwner={isOwner}
            status={statusStr}
          />
        )}

        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Tournament Auction Workflows</h3>
              <span className="text-xs text-slate-400">Milestone-by-milestone implementation</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Rules & Teams Quick Links */}
              <div 
                onClick={() => setActiveTab('settings')}
                className="cursor-pointer group rounded-xl border border-slate-800 bg-[#0e1424] p-5 space-y-3 hover:border-emerald-500/40 transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-emerald-300">Rules & Starting Purse</h4>
                    <p className="text-xs text-emerald-400 font-medium">Milestone 2 (Ready)</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Configure starting purse, squad size limits (min/max), and minimum acquisition price floor.
                </p>
              </div>

              <div 
                onClick={() => setActiveTab('teams')}
                className="cursor-pointer group rounded-xl border border-slate-800 bg-[#0e1424] p-5 space-y-3 hover:border-emerald-500/40 transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-blue-300">Participating Teams</h4>
                    <p className="text-xs text-blue-400 font-medium">Milestone 2 (Ready)</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Register teams, club franchise short codes, custom initial purses, and primary/secondary colors.
                </p>
              </div>

              <div 
                onClick={() => setActiveTab('tiers')}
                className="cursor-pointer group rounded-xl border border-slate-800 bg-[#0e1424] p-5 space-y-3 hover:border-emerald-500/40 transition-all"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-amber-300">Base Price Tiers</h4>
                    <p className="text-xs text-amber-400 font-medium">Milestone 2 (Ready)</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Configure standard pricing levels (e.g. ₹500, ₹1,000, ₹2,000) for player registration.
                </p>
              </div>

              {/* Future Milestone Cards */}
              <div className="rounded-xl border border-slate-800/80 bg-[#0e1424]/60 p-5 space-y-3 opacity-75">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-slate-800 text-slate-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300">Sets & Players</h4>
                    <p className="text-xs text-slate-500">Milestone 3</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Create player sets, player registration, base price assignment, and CSV roster import.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-[#0e1424]/60 p-5 space-y-3 opacity-75">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-slate-800 text-slate-400">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300">Preflight Validation</h4>
                    <p className="text-xs text-slate-500">Milestone 4</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Feasibility checklist ensuring mathematics, squad limits, and purse rules are verified.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800/80 bg-[#0e1424]/60 p-5 space-y-3 opacity-75">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-lg bg-slate-800 text-slate-400">
                    <Play className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-300">Auction Engine & UI</h4>
                    <p className="text-xs text-slate-500">Milestones 5 & 6</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Live bidding console, server-side randomized lots, SOLD/UNSOLD, and squad reserve guards.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
