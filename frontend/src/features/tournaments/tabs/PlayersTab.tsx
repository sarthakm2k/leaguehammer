import { PlayerPhotoManager } from '../../players/PlayerPhotoManager';
import { PlayerRatingsEditor } from '../../players/PlayerRatingsEditor';
import type { RatingValues, PlayerRatings } from '../../players/playerCardTypes';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { formatInr } from '../../../utils/formatters';
import { 
  Users, 
  Plus, 
  Search, 
  Filter, 
  Upload, 
  Download, 
  Trash2, 
  Edit3, 
  CheckCircle2, 
  AlertCircle, 
  X,
  FileSpreadsheet,
  Shirt,
  Shield,
  Zap,
  Target
} from 'lucide-react';

interface PlayerSet {
  id: string;
  name: string;
}

interface BasePriceTier {
  id: string;
  label: string;
  amount: number;
}

interface Player {
  id: string;
  tournamentId: string;
  playerSetId: string;
  playerSetName: string;
  name: string;
  photoUrl: string | null;
  cardPosition?: string | null;
  ratings?: PlayerRatings | null;
  age: number | null;
  position: string | null;
  preferredFoot: string | null;
  basePrice: number;
  jerseyNumber: number | null;
  previousTeam: string | null;
  shortBio: string | null;
  status: string;
  createdAtUtc: string;
}

interface CsvRowPreview {
  rowNumber: number;
  name: string;
  setName: string;
  basePrice: number;
  position: string | null;
  age: number | null;
  preferredFoot: string | null;
  previousTeam: string | null;
  jerseyNumber: number | null;
  isValid: boolean;
  validationErrors: string[];
  resolvedPlayerSetId: string | null;
}

interface CsvPreviewResult {
  totalRows: number;
  validRowsCount: number;
  invalidRowsCount: number;
  rows: CsvRowPreview[];
}

interface Props {
  tournamentId: string;
  isOwner: boolean;
  status: string;
  currencySymbol?: string;
}

export function PlayersTab({ tournamentId, isOwner, status, currencySymbol = '₹' }: Props) {
  const { token } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [sets, setSets] = useState<PlayerSet[]>([]);
  const [tiers, setTiers] = useState<BasePriceTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [photoPlayer, setPhotoPlayer] = useState<Player | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSet, setSelectedSet] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<string>('');

  // Add / Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [playerSetId, setPlayerSetId] = useState('');
  const [basePrice, setBasePrice] = useState<number>(1000);
  const [position, setPosition] = useState('');
  const [cardPosition, setCardPosition] = useState('');
  const [ratings, setRatings] = useState<RatingValues>({});
  const [age, setAge] = useState<string>('');
  const [preferredFoot, setPreferredFoot] = useState('');
  const [jerseyNumber, setJerseyNumber] = useState<string>('');
  const [previousTeam, setPreviousTeam] = useState('');
  const [shortBio, setShortBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // CSV Import Modal
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvPreviewResult | null>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
  const isDraft = status === 'DRAFT';

  const fetchReferenceData = useCallback(async () => {
    if (!token) return;
    try {
      const [setsRes, tiersRes] = await Promise.all([
        fetch(`${API_BASE}/api/tournaments/${tournamentId}/player-sets`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${API_BASE}/api/tournaments/${tournamentId}/base-price-tiers`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (setsRes.ok) {
        const setsData: PlayerSet[] = await setsRes.json();
        setSets(setsData);
      }
      if (tiersRes.ok) {
        const tiersData: BasePriceTier[] = await tiersRes.json();
        setTiers(tiersData);
      }
    } catch {
      // Non-blocking
    }
  }, [token, tournamentId, API_BASE]);

  const fetchPlayers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (selectedSet) params.append('playerSetId', selectedSet);
      if (selectedPosition) params.append('position', selectedPosition);
      params.append('pageSize', '100');

      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/players?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load player registry');
      const data = await res.json();
      setPlayers(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading players');
    } finally {
      setLoading(false);
    }
  }, [token, tournamentId, search, selectedSet, selectedPosition, API_BASE]);

  useEffect(() => {
    fetchReferenceData();
  }, [fetchReferenceData]);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const openCreateModal = () => {
    setEditingPlayer(null);
    setName('');
    setPlayerSetId(sets.length > 0 ? sets[0].id : '');
    setBasePrice(tiers.length > 0 ? tiers[0].amount : 1000);
    setPosition('Midfielder');
    setCardPosition(''); setRatings({});
    setAge('');
    setPreferredFoot('Right');
    setJerseyNumber('');
    setPreviousTeam('');
    setShortBio('');
    setPhotoUrl('');
    setModalError(null);
    setModalOpen(true);
  };

  const openEditModal = (p: Player) => {
    setEditingPlayer(p);
    setName(p.name);
    setPlayerSetId(p.playerSetId);
    setBasePrice(p.basePrice);
    setPosition(p.position || '');
    setCardPosition(p.cardPosition || ''); setRatings(p.ratings?.attributes || {});
    setAge(p.age ? String(p.age) : '');
    setPreferredFoot(p.preferredFoot || 'Right');
    setJerseyNumber(p.jerseyNumber ? String(p.jerseyNumber) : '');
    setPreviousTeam(p.previousTeam || '');
    setShortBio(p.shortBio || '');
    setPhotoUrl(p.photoUrl || '');
    setModalError(null);
    setModalOpen(true);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setModalError('Player name is required');
      return;
    }
    if (!playerSetId) {
      setModalError('Please select a player set');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    try {
      const isEditing = !!editingPlayer;
      const url = isEditing
        ? `${API_BASE}/api/tournaments/${tournamentId}/players/${editingPlayer.id}`
        : `${API_BASE}/api/tournaments/${tournamentId}/players`;

      const method = isEditing ? 'PUT' : 'POST';
      const body = {
        name: name.trim(),
        playerSetId,
        cardPosition: cardPosition || null, ratings,
        basePrice,
        photoUrl: photoUrl.trim() || null,
        age: age ? parseInt(age, 10) : null,
        position: position.trim() || null,
        preferredFoot: preferredFoot.trim() || null,
        jerseyNumber: jerseyNumber ? parseInt(jerseyNumber, 10) : null,
        previousTeam: previousTeam.trim() || null,
        shortBio: shortBio.trim() || null
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to save player' }));
        throw new Error(data.detail || 'Failed to save player');
      }

      setModalOpen(false);
      setSuccess(isEditing ? 'Player details updated' : 'Player added to registry');
      setTimeout(() => setSuccess(null), 3000);
      await fetchPlayers();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error saving player');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeletePlayer = async (id: string, playerName: string) => {
    if (!confirm(`Are you sure you want to remove player "${playerName}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/players/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to delete player' }));
        throw new Error(data.detail || 'Failed to delete player');
      }

      setSuccess(`Player "${playerName}" removed`);
      setTimeout(() => setSuccess(null), 3000);
      await fetchPlayers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error removing player');
    }
  };

  // CSV Import Handlers
  const handleCsvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvError(null);
    setCsvUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/players/csv-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to parse CSV' }));
        throw new Error(data.detail || 'Failed to parse CSV file');
      }

      const preview: CsvPreviewResult = await res.json();
      setCsvPreview(preview);
    } catch (err: unknown) {
      setCsvError(err instanceof Error ? err.message : 'Error parsing CSV file');
      setCsvPreview(null);
    } finally {
      setCsvUploading(false);
    }
  };

  const handleCommitCsvImport = async () => {
    if (!csvPreview || csvPreview.validRowsCount === 0) return;

    setCsvImporting(true);
    setCsvError(null);

    try {
      const res = await fetch(`${API_BASE}/api/tournaments/${tournamentId}/players/csv-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ players: csvPreview.rows })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Failed to import CSV' }));
        throw new Error(data.detail || 'Failed to complete import');
      }

      const result = await res.json();
      setCsvModalOpen(false);
      setCsvFile(null);
      setCsvPreview(null);
      setSuccess(`Successfully imported ${result.importedCount} players!`);
      setTimeout(() => setSuccess(null), 4000);
      await fetchPlayers();
    } catch (err: unknown) {
      setCsvError(err instanceof Error ? err.message : 'Error committing import');
    } finally {
      setCsvImporting(false);
    }
  };

  const getPositionIcon = (pos: string | null) => {
    switch (pos?.toLowerCase()) {
      case 'forward':
      case 'attacker':
      case 'striker':
        return <Zap className="w-3.5 h-3.5 text-amber-400" />;
      case 'defender':
        return <Shield className="w-3.5 h-3.5 text-blue-400" />;
      case 'goalkeeper':
        return <Target className="w-3.5 h-3.5 text-purple-400" />;
      default:
        return <Shirt className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  const getPositionBadgeStyle = (pos: string | null) => {
    switch (pos?.toLowerCase()) {
      case 'forward':
      case 'attacker':
      case 'striker':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'defender':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'goalkeeper':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-lg font-bold text-white tracking-tight">Player Registry</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                {players.length} registered
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              Manage player pool, assign sets, specify base valuations, and import players via CSV.
            </p>
          </div>
        </div>

        {isOwner && isDraft && (
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => {
                setCsvModalOpen(true);
                setCsvFile(null);
                setCsvPreview(null);
                setCsvError(null);
              }}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Import CSV</span>
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              disabled={sets.length === 0}
              title={sets.length === 0 ? 'Create a player set first' : ''}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              <span>Add Player</span>
            </button>
          </div>
        )}
      </div>

      {sets.length === 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center space-x-3 text-amber-400 text-xs">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>You must create at least one <strong>Player Set</strong> before adding players. Switch to the <strong>Player Sets</strong> tab to initialize sets.</span>
        </div>
      )}

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

      {/* Search and Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by player name, club..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
          />
        </div>

        <div className="relative">
          <Filter className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <select
            value={selectedSet}
            onChange={e => setSelectedSet(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition appearance-none cursor-pointer"
          >
            <option value="">All Player Sets</option>
            {sets.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <Shirt className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <select
            value={selectedPosition}
            onChange={e => setSelectedPosition(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition appearance-none cursor-pointer"
          >
            <option value="">All Positions</option>
            <option value="Forward">Forward</option>
            <option value="Midfielder">Midfielder</option>
            <option value="Defender">Defender</option>
            <option value="Goalkeeper">Goalkeeper</option>
          </select>
        </div>
      </div>

      {/* Players Grid */}
      {loading ? (
        <div className="py-16 flex justify-center items-center text-slate-500 text-sm">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mr-3"></div>
          Loading players...
        </div>
      ) : players.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-2xl p-12 text-center">
          <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h4 className="text-white font-semibold text-sm">No players found</h4>
          <p className="text-slate-400 text-xs max-w-md mx-auto mt-1 mb-5">
            {search || selectedSet || selectedPosition
              ? 'No players matched the active search or filters.'
              : 'Add players manually or import your roster using a CSV spreadsheet.'}
          </p>
          {isOwner && isDraft && sets.length > 0 && (
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setCsvModalOpen(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Import CSV Roster</span>
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Player</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {players.map(p => (
            <div
              key={p.id}
              className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4.5 transition relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-sm shadow-inner flex-shrink-0">
                      {p.photoUrl ? (
                        <img src={p.photoUrl} alt={p.name} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <span>{p.name.substring(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm tracking-tight">{p.name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-[11px] font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                          {p.playerSetName}
                        </span>
                        {p.position && (
                          <span className={`inline-flex items-center space-x-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${getPositionBadgeStyle(p.position)}`}>
                            {getPositionIcon(p.position)}
                            <span>{p.position}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Base Price</div>
                    <div className="text-emerald-400 font-extrabold text-sm tracking-tight">
                      {formatInr(p.basePrice)}
                    </div>
                  </div>
                </div>

                {/* Metadata Row */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Age</span>
                    <span className="font-semibold text-slate-300">{p.age ? `${p.age} yrs` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Foot</span>
                    <span className="font-semibold text-slate-300">{p.preferredFoot || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">Prev Club</span>
                    <span className="font-semibold text-slate-300 truncate block" title={p.previousTeam || ''}>
                      {p.previousTeam || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {isOwner && <button type="button" onClick={() => setPhotoPlayer(p)} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold" aria-label={`Manage photo for ${p.name}`}><Upload size={14}/>{p.photoUrl ? 'Manage photo' : 'Add photo'}</button>}
              {/* Action Buttons */}
              {isOwner && isDraft && (
                <div className="flex items-center justify-end space-x-2 mt-4 pt-3 border-t border-slate-800/50">
                  <button
                    type="button"
                    onClick={() => openEditModal(p)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                    title="Edit player"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeletePlayer(p.id, p.name)}
                    className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                    title="Remove player"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {photoPlayer && <PlayerPhotoManager tournamentId={tournamentId} player={photoPlayer} token={token} onClose={() => setPhotoPlayer(null)} onSaved={url => { setPlayers(current => current.map(player => player.id === photoPlayer.id ? { ...player, photoUrl: url } : player)); setSuccess(url ? 'Player photo updated.' : 'Player photo removed.'); }} />}
      {/* Add / Edit Player Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <Shirt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">
                  {editingPlayer ? 'Edit Player' : 'Add Player to Registry'}
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

            <form onSubmit={handleSavePlayer} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Full Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Arjun Nair"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Player Set <span className="text-emerald-400">*</span>
                  </label>
                  <select
                    required
                    value={playerSetId}
                    onChange={e => setPlayerSetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    {sets.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Base Price ({currencySymbol}) <span className="text-emerald-400">*</span>
                  </label>
                  {tiers.length > 0 ? (
                    <select
                      value={basePrice}
                      onChange={e => setBasePrice(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      {tiers.map(t => (
                        <option key={t.id} value={t.amount}>{t.label} ({currencySymbol}{t.amount})</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min={100}
                      value={basePrice}
                      onChange={e => setBasePrice(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Position</label>
                  <select
                    value={position}
                    onChange={e => setPosition(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="Forward">Forward</option>
                    <option value="Midfielder">Midfielder</option>
                    <option value="Defender">Defender</option>
                    <option value="Goalkeeper">Goalkeeper</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Age</label>
                  <input
                    type="number"
                    min={12}
                    max={60}
                    placeholder="e.g. 24"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Foot</label>
                  <select
                    value={preferredFoot}
                    onChange={e => setPreferredFoot(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  >
                    <option value="Right">Right</option>
                    <option value="Left">Left</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Previous Club</label>
                  <input
                    type="text"
                    placeholder="e.g. Malabar FC"
                    value={previousTeam}
                    onChange={e => setPreviousTeam(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Jersey Number</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    placeholder="e.g. 10"
                    value={jerseyNumber}
                    onChange={e => setJerseyNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Photo URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/player.jpg"
                  value={photoUrl}
                  onChange={e => setPhotoUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Short Bio</label>
                <textarea
                  rows={2}
                  placeholder="Key strengths, district level experience..."
                  value={shortBio}
                  onChange={e => setShortBio(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition resize-none"
                />
              </div>

              <PlayerRatingsEditor value={ratings} onChange={setRatings} cardPosition={cardPosition} onPositionChange={setCardPosition} position={position} name={name} photoUrl={photoUrl} disabled={modalSubmitting} />

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : editingPlayer ? 'Update Player' : 'Add Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 flex-shrink-0">
              <div className="flex items-center space-x-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Bulk Import Players via CSV</h3>
              </div>
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {csvError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex-shrink-0">
                {csvError}
              </div>
            )}

            {/* Step 1: Upload or Download Template */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800 flex-shrink-0">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-white block">Download Format Template</span>
                Need the standard spreadsheet structure? Download the ready-to-use CSV template.
              </div>
              <a
                href={`${API_BASE}/api/tournaments/${tournamentId}/players/csv-template`}
                download="players_template.csv"
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Template</span>
              </a>
            </div>

            {/* File Upload Zone */}
            <div className="flex-shrink-0">
              <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition group">
                <Upload className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 mb-2 transition" />
                <span className="text-xs font-semibold text-white">
                  {csvFile ? csvFile.name : 'Select or drop your CSV spreadsheet here'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">Supports .csv files up to 5MB</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {csvUploading && (
              <div className="py-6 flex justify-center items-center text-xs text-slate-400">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-500 mr-2"></div>
                Analyzing and validating CSV rows...
              </div>
            )}

            {/* Preview Section */}
            {csvPreview && (
              <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between text-xs flex-shrink-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white">Validation Preview</span>
                    <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded-full text-[10px]">
                      {csvPreview.totalRows} rows
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 text-[11px]">
                    <span className="text-emerald-400 font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{csvPreview.validRowsCount} Valid</span>
                    </span>
                    {csvPreview.invalidRowsCount > 0 && (
                      <span className="text-rose-400 font-semibold flex items-center space-x-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{csvPreview.invalidRowsCount} Invalid (will be skipped)</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Rows Table */}
                <div className="border border-slate-800 rounded-xl overflow-y-auto max-h-60 text-xs">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider">
                      <tr>
                        <th className="p-2.5">Row</th>
                        <th className="p-2.5">Player Name</th>
                        <th className="p-2.5">Set</th>
                        <th className="p-2.5">Base Price</th>
                        <th className="p-2.5">Position</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 bg-slate-900/60">
                      {csvPreview.rows.map(r => (
                        <tr key={r.rowNumber} className={r.isValid ? '' : 'bg-rose-500/5'}>
                          <td className="p-2.5 text-slate-500 font-mono text-[10px]">#{r.rowNumber}</td>
                          <td className="p-2.5 font-semibold text-white">{r.name || '—'}</td>
                          <td className="p-2.5 text-purple-400">{r.setName || '—'}</td>
                          <td className="p-2.5 font-mono text-emerald-400">{formatInr(r.basePrice)}</td>
                          <td className="p-2.5 text-slate-300">{r.position || '—'}</td>
                          <td className="p-2.5">
                            {r.isValid ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-400 text-[10px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Ready</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-rose-400 text-[10px] font-semibold" title={r.validationErrors.join(', ')}>
                                <AlertCircle className="w-3 h-3" />
                                <span className="truncate max-w-[120px]">{r.validationErrors[0]}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800 flex-shrink-0">
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitCsvImport}
                disabled={!csvPreview || csvPreview.validRowsCount === 0 || csvImporting}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {csvImporting ? 'Importing Roster...' : `Import ${csvPreview?.validRowsCount || 0} Valid Players`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
