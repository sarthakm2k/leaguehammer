import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { registrationRequest } from '../registrations/registrationApi';
import type { AssignedTeamPlayer } from './teamPlayers';
import './team-assignments.css';
interface Assignments {assignedPlayers:AssignedTeamPlayer[];availablePlayers:{playerId:string;playerName:string;position?:string|null}[];maximumSquadSize:number}
export function TeamAssignmentsDialog({tournamentId,team,onClose,onSaved}:{tournamentId:string;team:{id:string;name:string};onClose:()=>void;onSaved:()=>void}) {
  const {token}=useAuth();const dialog=useRef<HTMLDialogElement>(null);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const root=`/api/tournaments/${tournamentId}/teams/${team.id}/assignments`;
  const query=useQuery({queryKey:['team-assignments',team.id,token],queryFn:({signal})=>registrationRequest<Assignments>(root,{signal,headers:{Authorization:`Bearer ${token}`}}),refetchOnWindowFocus:false,refetchOnReconnect:false,gcTime:0});
  useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
  const save=async(captainPlayerId:string,iconPlayerIds:string[])=>{
    if(busy)return;setBusy(true);setError('');
    try{await registrationRequest(root,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({captainPlayerId:captainPlayerId||null,iconPlayerIds})});onSaved();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <dialog ref={dialog} className="team-assignment-dialog" aria-labelledby="team-assignment-title" onCancel={event=>{event.preventDefault();if(!busy)onClose();}}>
    <h2 id="team-assignment-title">Captain &amp; icons · {team.name}</h2><p>Select registered players for this team. They count toward squad size, skip the auction, and do not reduce the team's purse.</p>
    {query.isPending && <p role="status">Loading registered players…</p>}{query.isError && <p role="alert">Could not load players. <button type="button" onClick={()=>void query.refetch()}>Retry</button></p>}
    {query.data && Number.isInteger(query.data.maximumSquadSize) && <AssignmentForm key={query.dataUpdatedAt} data={query.data} busy={busy} error={error} onCancel={onClose} onSave={save}/>}
    {query.data && !Number.isInteger(query.data.maximumSquadSize) && <p role="alert">The server is still using the single-icon version. <button type="button" onClick={()=>void query.refetch()}>Retry after deployment</button></p>}
    {(!query.data || !Number.isInteger(query.data.maximumSquadSize)) && <button type="button" onClick={onClose}>Close</button>}
  </dialog>;
}
function AssignmentForm({data,busy,error,onCancel,onSave}:{data:Assignments;busy:boolean;error:string;onCancel:()=>void;onSave:(captain:string,icons:string[])=>void}) {
  const [captain,setCaptain]=useState(data.assignedPlayers.find(p=>p.role==='CAPTAIN')?.playerId||'');
  const [icons,setIcons]=useState(data.assignedPlayers.filter(p=>p.role==='ICON').map(p=>p.playerId));
  const [search,setSearch]=useState('');
  const assignedCount=icons.length+(captain?1:0);
  const maximumSquadSize=data.maximumSquadSize;
  const full=assignedCount>=maximumSquadSize;
  const visible=data.availablePlayers.filter(p=>`${p.playerName} ${p.position||''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const toggleIcon=(id:string)=>setIcons(current=>current.includes(id)?current.filter(playerId=>playerId!==id):[...current,id]);
  return <form onSubmit={event=>{event.preventDefault();void onSave(captain,icons);}}>
    {!data.availablePlayers.length && <p>No available registered players. Approve registrations or add players in Player Registry first.</p>}
    <label>Team captain<select value={captain} disabled={busy} onChange={event=>setCaptain(event.target.value)}><option value="">Not assigned</option>{data.availablePlayers.map(p=><option key={p.playerId} value={p.playerId} disabled={icons.includes(p.playerId)||(!captain&&full)}>{p.playerName}{p.position ? ` · ${p.position}`:''}</option>)}</select></label>
    <fieldset className="team-assignment-icons" disabled={busy}>
      <legend>Team icon players</legend>
      <p>Select any number of icons within the squad limit. The captain cannot also be an icon.</p>
      <label className="team-icon-search">Search icon players<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Player name or position"/></label>
      <p role="status">{icons.length} icon {icons.length===1?'player':'players'} selected · {assignedCount}/{maximumSquadSize} squad places assigned</p>
      {!!icons.length && <div className="team-icon-selected" aria-label="Selected icon players">{data.availablePlayers.filter(p=>icons.includes(p.playerId)).map(p=><button key={p.playerId} type="button" disabled={busy} onClick={()=>toggleIcon(p.playerId)} aria-label={`Remove ${p.playerName} as icon`}>{p.playerName} <span aria-hidden="true">×</span></button>)}</div>}
      <div className="team-icon-options">{visible.map(p=><label className="team-icon-option" key={p.playerId}>
        <input type="checkbox" checked={icons.includes(p.playerId)} disabled={p.playerId===captain||(!icons.includes(p.playerId)&&full)} onChange={()=>toggleIcon(p.playerId)}/>
        <span>{p.playerName}<small>{p.playerId===captain?'Team captain':p.position||'Player'}</small></span>
      </label>)}{!visible.length && <p>No matching players.</p>}</div>
    </fieldset>
    <p>Uncheck an icon or choose “Not assigned” for captain to return that player to the auction pool. Players already assigned to another team cannot be selected.</p>
    {assignedCount>maximumSquadSize && <p role="alert" className="team-assignment-error">Remove assignments to fit the maximum squad size.</p>}
    {error && <p role="alert" className="team-assignment-error">{error}</p>}
    <div className="team-assignment-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy||assignedCount>maximumSquadSize}>{busy?'Saving…':'Save assignments'}</button></div>
  </form>;
}
