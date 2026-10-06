import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { GOALKEEPER_ATTRIBUTES, OUTFIELD_ATTRIBUTES, isGoalkeeper, type CardPlayer } from './playerCardTypes';
import './player-card.css';

export function FootballPlayerCard({ player }: { player: CardPlayer }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const goalkeeper = isGoalkeeper(player.cardPosition,player.position);
  const shortPosition = player.cardPosition || ({Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Forward:'FWD'}[player.position || ''] ?? '');
  return <article className="football-player-card" aria-label={`${player.playerName} player card`}>
    <div className="football-card-trim" aria-hidden="true" /><p className="football-card-edition">LeagueHammer / Player edition</p>
    <div className="football-card-overall"><strong aria-label={player.ratings?.overall == null ? 'Overall not rated' : `Overall ${player.ratings.overall}`}>{player.ratings?.overall ?? ''}</strong><span>{shortPosition}</span></div>
    <div className="football-card-photo">{player.photoUrl && player.photoUrl !== failedPhoto ? <img src={player.photoUrl} alt={player.playerName} onError={() => setFailedPhoto(player.photoUrl || null)} /> : <UserRound aria-label="Player photo unavailable" />}</div>
    {player.jerseyNumber != null && <span className="football-card-jersey">#{player.jerseyNumber}</span>}
    <p className="football-card-name" style={player.playerName.length > 40 ? {fontSize:'min(4cqw,3cqh)'} : player.playerName.length > 24 ? {fontSize:'min(5cqw,3.8cqh)'} : undefined}>{player.playerName}</p>
    <dl className="football-card-attributes">{(goalkeeper ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES).map(([key,code,label]) => <div key={key}><dt title={label}>{code}</dt><dd aria-label={`${label} ${player.ratings?.attributes[key] ?? 'not rated'}`}>{player.ratings?.attributes[key] ?? ''}</dd></div>)}</dl>
    <span className="football-card-signature">LEAGUE<span>HAMMER</span></span>
  </article>;
}
