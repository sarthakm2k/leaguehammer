import { useState } from 'react';
import './player-portrait.css';
import { roleLabel } from '../teams/teamPlayers';

interface PlayerProfile {
  playerName: string;
  photoUrl?: string | null;
  position?: string | null;
  jerseyNumber?: number | null;
  assignedRole?:string|null;
}

export function PlayerPortrait({ player, showDetails = false }: { player: PlayerProfile; showDetails?: boolean }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const hasPhoto = !!player.photoUrl && player.photoUrl !== failedPhoto;
  return <article className={`player-portrait${showDetails ? ' player-portrait-with-details' : ''}`} aria-label={`${player.playerName} player profile`}>
    <div className="player-portrait-photo">{hasPhoto
      ? <img src={player.photoUrl!} alt={player.playerName} onError={() => setFailedPhoto(player.photoUrl!)} />
      : <img className="player-portrait-avatar" src="/brand/player-avatar.svg" alt={`${player.playerName} avatar`} aria-label="Player photo unavailable" />}
    </div>
    {showDetails && <div className="player-portrait-details"><strong style={player.playerName.length > 60 ? { fontSize:'4cqw' } : player.playerName.length > 24 ? { fontSize:'6cqw' } : undefined}>{player.playerName}</strong><span>{player.assignedRole ? `${roleLabel(player.assignedRole)} · ` : ''}{player.position || 'Player'}{player.jerseyNumber == null ? '' : ` · #${player.jerseyNumber}`}</span></div>}
  </article>;
}
