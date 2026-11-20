import type { ResultPlayer } from '../auction/resultsTypes';
export interface AssignedTeamPlayer {
  playerId:string; playerName:string; photoUrl?:string|null; position?:string|null;
  age?:number|null; preferredFoot?:string|null; jerseyNumber?:number|null; role:'CAPTAIN'|'ICON';
}
export const roleLabel = (role?:string|null) => role === 'CAPTAIN' ? 'Captain' : role === 'ICON' ? 'Icon player' : '';
export const playerTeamId = (player:ResultPlayer) => player.assignedTeamId ?? player.winningTeamId;
export const playerTeamName = (player:ResultPlayer) => player.assignedTeamName ?? player.winningTeamName;
export const isSquadPlayer = (player:ResultPlayer) => player.status === 'SOLD' || player.status === 'ASSIGNED';
export const playerAcquisition = (player:ResultPlayer,money:(amount:number)=>string) => player.assignedRole ? `${roleLabel(player.assignedRole)} · Preassigned` : player.status === 'SOLD' ? money(player.finalPrice ?? 0) : 'Unsold';
