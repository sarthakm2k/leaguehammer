import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { registrationRequest } from '../registrations/registrationApi';
import type { AssignedTeamPlayer } from './teamPlayers';
import './team-assignments.css';
interface Assignments {assignedPlayers:AssignedTeamPlayer[];availablePlayers:{playerId:string;playerName:string;position?:string|null}[]}
export function TeamAssignmentsDialog({tournamentId,team,onClose,onSaved}:{tournamentId:string;team:{id:string;name:string};onClose:()=>void;onSaved:()=>void}) {
  const {token}=useAuth();const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const root=`/api/tournaments/${tournamentId}/teams/${team.id}/assignments`;
  const query=useQuery({queryKey:['team-assignments',team.id,token],queryFn:({signal})=>registrationRequest<Assignments>(root,{signal,headers:{Authorization:`Bearer ${token}`}}),refetchOnWindowFocus:false,refetchOnReconnect:false,gcTime:0});
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const save=async(captainPlayerId:string,iconPlayerId:string)=>{
    if(busy)return;setBusy(true);setError('');
    try{await registrationRequest(root,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({captainPlayerId:captainPlayerId||null,iconPlayerId:iconPlayerId||null})});onSaved();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="team-assignment-dialog" aria-labelledby="team-assignment-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <h2 id="team-assignment-title">Captain &amp; icon · {team.name}</h2><p>Select registered players for this team. They count toward squad size, skip the auction, and do not reduce the team's purse.</p>
    {query.isPending && <p role="status">Loading registered players…</p>}{query.isError && <p role="alert">Could not load players. <button type="button" onClick={()=>void query.refetch()}>Retry</button></p>}
    {query.data && <AssignmentForm key={query.dataUpdatedAt} data={query.data} busy={busy} error={error} onCancel={onClose} onSave={save}/>}
    {!query.data && <button type="button" onClick={onClose}>Close</button>}
  </dialog>;
}
function AssignmentForm({data,busy,error,onCancel,onSave}:{data:Assignments;busy:boolean;error:string;onCancel:()=>void;onSave:(captain:string,icon:string)=>void}) {
  const [captain,setCaptain]=useState(data.assignedPlayers.find(p=>p.role==='CAPTAIN')?.playerId||'');
  const [icon,setIcon]=useState(data.assignedPlayers.find(p=>p.role==='ICON')?.playerId||'');
  return <form onSubmit={event=>{event.preventDefault();void onSave(captain,icon);}}>
    {!data.availablePlayers.length && <p>No available registered players. Approve registrations or add players in Player Registry first.</p>}
    <label>Team captain<select value={captain} disabled={busy} onChange={event=>setCaptain(event.target.value)}><option value="">Not assigned</option>{data.availablePlayers.map(p=><option key={p.playerId} value={p.playerId} disabled={p.playerId===icon}>{p.playerName}{p.position ? ` · ${p.position}`:''}</option>)}</select></label>
    <label>Team icon player<select value={icon} disabled={busy} onChange={event=>setIcon(event.target.value)}><option value="">Not assigned</option>{data.availablePlayers.map(p=><option key={p.playerId} value={p.playerId} disabled={p.playerId===captain}>{p.playerName}{p.position ? ` · ${p.position}`:''}</option>)}</select></label>
    <p>Captain and icon must be different players. Only players available for this team appear here. Choose “Not assigned” to return a player to the auction pool.</p>
    {error && <p role="alert" className="team-assignment-error">{error}</p>}
    <div className="team-assignment-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy}>{busy?'Saving…':'Save assignments'}</button></div>
  </form>;
}
