import { useState } from 'react';
import { roleLabel, type AssignedTeamPlayer } from './teamPlayers';
import './team-assignments.css';
function AssignedPhoto({player}:{player:AssignedTeamPlayer}) {
  const [failed,setFailed]=useState(false);
  return <img src={!failed && player.photoUrl ? player.photoUrl:'/brand/player-avatar.svg'} alt={player.playerName} onError={()=>setFailed(true)} />;
}
export function TeamAssignedPlayers({players}:{players?:AssignedTeamPlayer[]|null}) {
  if(!players?.length)return null;
  return <section className="team-assigned-players" aria-label="Captain and icon players">{players.map(player=><div key={player.playerId}><AssignedPhoto player={player}/><span><small>{roleLabel(player.role)}</small><strong>{player.playerName}</strong></span></div>)}</section>;
}
