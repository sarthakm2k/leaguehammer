import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { Plus, Users, Edit2, Trash2, AlertCircle, X, Shield } from 'lucide-react';
import { formatInr } from '../../../utils/formatters';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface Team {
  id: string;
  tournamentId: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string | null;
  ownerName: string | null;
  initialPurse: number;
}

interface Props {
  tournamentId: string;
  isOwner: boolean;
  status: string;
  defaultPurse: number;
}

const PRESET_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#F97316', // Orange
];

export function TeamsTab({ tournamentId, isOwner, status, defaultPurse }: Props) {
  const { token } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [initialPurse, setInitialPurse] = useState<number>(defaultPurse);
  const [primaryColor, setPrimaryColor] = useState('#10B981');
  const [secondaryColor, setSecondaryColor] = useState('#047857');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTeams = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/teams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load teams');
      const data = await res.json();
      setTeams(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading teams');
    } finally {
      setLoading(false);
    }
  }, [token, tournamentId]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const openCreateModal = () => {
    setEditingTeam(null);
    setName('');
    setShortName('');
    setOwnerName('');
    setInitialPurse(defaultPurse);
    setPrimaryColor('#10B981');
    setSecondaryColor('#047857');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (t: Team) => {
    setEditingTeam(t);
    setName(t.name);
    setShortName(t.shortName);
    setOwnerName(t.ownerName || '');
    setInitialPurse(t.initialPurse);
    setPrimaryColor(t.primaryColor);
    setSecondaryColor(t.secondaryColor || '#047857');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || status !== 'DRAFT') return;
    setFormError(null);
    setSubmitting(true);

    try {
      const isEditing = !!editingTeam;
      const url = isEditing
        ? `${API_BASE}/api/tournaments/${tournamentId}/teams/${editingTeam.id}`
        : `${API_BASE}/api/tournaments/${tournamentId}/teams`;

      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: name.trim(),
          shortName: shortName.trim().toUpperCase(),
          ownerName: ownerName.trim() || null,
          initialPurse,
          primaryColor,
          secondaryColor
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to save team' }));
        throw new Error(err.detail || 'Failed to save team');
      }

      setModalOpen(false);
      await fetchTeams();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!isOwner || status !== 'DRAFT') return;
    if (!confirm('Are you sure you want to delete this team?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/teams/${teamId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete team');
      await fetchTeams();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
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

      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <h3 className="text-lg font-black text-white tracking-tight">Participating Teams ({teams.length})</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Teams competing in the auction. Each team has an initial purse and club identity colors.
          </p>
        </div>

        {isOwner && !isLocked && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Team</span>
          </button>
        )}
      </div>

      {/* Teams Grid */}
      {loading ? (
        <div className="text-xs text-slate-400 py-12 text-center">Loading teams...</div>
      ) : teams.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/20 p-8 space-y-4">
          <Users className="w-12 h-12 text-slate-600 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-base font-bold text-white">No teams created yet</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Add the participating teams that will bid for players in this tournament.
            </p>
          </div>
          {isOwner && !isLocked && (
            <button
              onClick={openCreateModal}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow"
            >
              <Plus className="w-4 h-4" />
              <span>Create First Team</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-slate-800 bg-[#0e1424] p-5 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-white shadow-md"
                      style={{ backgroundColor: t.primaryColor }}
                    >
                      {t.shortName}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">{t.name}</h4>
                      <p className="text-xs text-slate-400">
                        {t.ownerName ? `Owner: ${t.ownerName}` : 'Club Franchise'}
                      </p>
                    </div>
                  </div>

                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                    {t.shortName}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-400">Starting Purse:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatInr(t.initialPurse)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <div
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ backgroundColor: t.primaryColor }}
                    title={`Primary: ${t.primaryColor}`}
                  />
                  {t.secondaryColor && (
                    <div
                      className="w-3 h-3 rounded-full border border-white/20"
                      style={{ backgroundColor: t.secondaryColor }}
                      title={`Secondary: ${t.secondaryColor}`}
                    />
                  )}
                </div>

                {isOwner && !isLocked && (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => openEditModal(t)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title="Edit Team"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTeam(t.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      title="Delete Team"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Team Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0e1424] border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Shield className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingTeam ? 'Edit Team' : 'Add New Team'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 flex items-start space-x-2 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Team Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Falcons FC"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Short Code *</label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value.toUpperCase())}
                    placeholder="FLC"
                    className="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white uppercase font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Owner Name</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Jamal K"
                    className="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Starting Purse (₹)</label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  required
                  value={initialPurse}
                  onChange={(e) => setInitialPurse(Number(e.target.value))}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Default: {formatInr(defaultPurse)}</p>
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Primary Club Color</label>
                <div className="flex items-center space-x-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setPrimaryColor(color)}
                      className={`w-6 h-6 rounded-full transition-transform ${primaryColor === color ? 'scale-125 ring-2 ring-white' : 'opacity-80 hover:opacity-100'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-7 h-7 rounded border-none bg-transparent cursor-pointer ml-2"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-colors shadow disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingTeam ? 'Update Team' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
