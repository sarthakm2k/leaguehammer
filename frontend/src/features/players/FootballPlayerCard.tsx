import { useId, useState } from 'react';
import { Gavel } from 'lucide-react';
import { GOALKEEPER_ATTRIBUTES, OUTFIELD_ATTRIBUTES, isGoalkeeper, type CardPlayer } from './playerCardTypes';
import './player-card.css';

function CardArtwork() {
  const id = useId().replace(/:/g,'');
  const shield = 'M150 8 Q135 31 121 16 Q101 20 82 28 L25 53 L15 53 L15 359 Q15 383 42 395 L150 444 L258 395 Q285 383 285 359 L285 53 L275 53 L218 28 Q199 20 179 16 Q165 31 150 8Z';
  return <svg className="football-card-artwork" viewBox="0 0 300 450" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff2b0"/><stop offset=".22" stopColor="#ab8131"/><stop offset=".48" stopColor="#ffe898"/><stop offset=".72" stopColor="#b58a36"/><stop offset="1" stopColor="#ffecab"/></linearGradient>
      <linearGradient id={`${id}-blue`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#153cbb"/><stop offset=".45" stopColor="#102a8c"/><stop offset="1" stopColor="#071340"/></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#5599ff" stopOpacity=".65"/><stop offset="1" stopColor="#3156cf" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-crystal`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#79bfff"/><stop offset=".35" stopColor="#355eff"/><stop offset=".7" stopColor="#2520a8"/><stop offset="1" stopColor="#090d50"/></linearGradient>
      <clipPath id={`${id}-shield`}><path d={shield}/></clipPath>
    </defs>
    <path d={shield} fill={`url(#${id}-blue)`} stroke={`url(#${id}-gold)`} strokeWidth="4"/>
    <g clipPath={`url(#${id}-shield)`}>
      <ellipse cx="216" cy="135" rx="148" ry="155" fill={`url(#${id}-glow)`}/>
      <path d="M-20 297L309 76 335 121 8 366Z" fill="#4775eb" opacity=".16"/>
      <path d="M-10 241L208 110 234 166 18 329Z" fill="#e8cc7d" opacity=".13"/>
      <path d="M40 58L135 95 100 177 185 154 256 241" fill="none" stroke="#dabd70" strokeWidth=".7" opacity=".38"/>
      <path d="M13 334L91 256 155 310 270 194M13 346L92 268 158 322 283 207" fill="none" stroke="#4f7ff5" strokeWidth="1" opacity=".25"/>
      <path d="M36 66L266 382M44 62L274 378M25 203L157 430" stroke="#9abbff" strokeWidth=".5" opacity=".12"/>
      {Array.from({length:7},(_,i)=><path key={i} d={`M${34+i*34} 309l6 6m0-6l-6 6`} stroke="#d5bb73" strokeWidth="1" opacity=".2"/>)}
    </g>
    <path d={shield} transform="translate(8 11) scale(.946 .948)" fill="none" stroke={`url(#${id}-gold)`} strokeWidth="1.7"/>
    <path d={shield} transform="translate(12 17) scale(.92 .925)" fill="none" stroke="#89a0eb" strokeOpacity=".42" strokeWidth=".6"/>
    {[{x:263,y:59,s:1.1,r:19},{x:274,y:110,s:.65,r:34},{x:17,y:339,s:.7,r:-26},{x:251,y:377,s:.62,r:29},{x:35,y:38,s:.5,r:-24}].map((gem,i)=><g key={i} transform={`translate(${gem.x} ${gem.y}) rotate(${gem.r}) scale(${gem.s})`}>
      <path d="M0-31L17-13 13 30 0 41-14 24-16-12Z" fill={`url(#${id}-crystal)`} stroke="#769fff" strokeWidth=".6"/>
      <path d="M0-31L3-8-16-12ZM3-8L17-13 13 30Z" fill="#93cfff" opacity=".65"/>
      <path d="M3-8L13 30 0 41-3 9Z" fill="#405cff"/><path d="M-16-12L3-8-3 9-14 24Z" fill="#2334b8"/>
      <path d="M0-31L3-8-3 9 0 41M-16-12L3-8 17-13" fill="none" stroke="#aedaff" strokeOpacity=".5" strokeWidth=".6"/>
    </g>)}
  </svg>;
}

export function FootballPlayerCard({ player }: { player: CardPlayer }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const goalkeeper = isGoalkeeper(player.cardPosition,player.position);
  const shortPosition = player.cardPosition || ({Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Forward:'FWD'}[player.position || ''] ?? '');
  return <article className="football-player-card" aria-label={`${player.playerName} player card`}>
    <CardArtwork /><div className="football-card-crest" aria-hidden="true"><Gavel /></div><p className="football-card-edition">PLAYER EDITION</p>
    <div className="football-card-overall"><strong aria-label={player.ratings?.overall == null ? 'Overall not rated' : `Overall ${player.ratings.overall}`}>{player.ratings?.overall ?? ''}</strong><span>{shortPosition}</span></div>
    <div className="football-card-photo">{player.photoUrl && player.photoUrl !== failedPhoto ? <img src={player.photoUrl} alt={player.playerName} onError={() => setFailedPhoto(player.photoUrl || null)} /> : <img className="football-card-avatar" src="/brand/player-avatar.svg" alt={`${player.playerName} avatar`} aria-label="Player photo unavailable" />}</div>
    {player.jerseyNumber != null && <span className="football-card-jersey">#{player.jerseyNumber}</span>}
    <p className="football-card-name" style={player.playerName.length > 40 ? {fontSize:'min(4cqw,3cqh)'} : player.playerName.length > 24 ? {fontSize:'min(5cqw,3.8cqh)'} : undefined}>{player.playerName}</p>
    <dl className="football-card-attributes">{(goalkeeper ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES).map(([key,code,label]) => <div key={key}><dt title={label}>{code}</dt><dd aria-label={`${label} ${player.ratings?.attributes[key] ?? 'not rated'}`}>{player.ratings?.attributes[key] ?? ''}</dd></div>)}</dl>
    <span className="football-card-signature">LEAGUE<span>HAMMER</span></span>
  </article>;
}
