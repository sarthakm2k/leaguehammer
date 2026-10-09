import { useCallback, useRef, useState } from 'react';
import type { AuctionResults } from './resultsTypes';

export type ActivityItem = { id: string; text: string; time: string | null };
export function useAuctionActivity(data: AuctionResults | undefined) {
  const [feed,setFeed]=useState<{tournamentId?:string;items:ActivityItem[]}>({items:[]});
  const items=feed.tournamentId===data?.state.tournamentId?feed.items:[];
  const counter=useRef(0);
  const onEvent=useCallback((event:string,args:unknown[])=>{
    const value=args[0];if(!value || typeof value!=='object')return;
    const lot=value as Record<string,unknown>;
    const name=typeof lot.playerName==='string'?lot.playerName:'';
    let text='';
    if(event==='PlayerSold'&&name)text=`${name} signed by ${typeof lot.winningTeamName==='string'?lot.winningTeamName:'a team'}`;
    if(event==='PlayerUnsold'&&name)text=`${name} went unsold`;
    if(event==='PlayerRevealed'&&name)text=`${name} is on the podium${typeof lot.playerSetName==='string' ? ` / ${lot.playerSetName}` : ''}`;
    if(event==='ResultCorrected'&&name)text=`${name}: result corrected`;
    if(event==='SetCompleted'&&typeof lot.setName==='string')text=`${lot.setName}: set completed`;
    if(text){ const item={id:`live-${++counter.current}`,text,time:new Date().toISOString()};setFeed(previous=>({tournamentId:data?.state.tournamentId,items:[item,...(previous.tournamentId===data?.state.tournamentId?previous.items:[])].slice(0,20)})); }
  },[data?.state.tournamentId]);
  const sold=(data?.state.soldPlayers || []).map(lot=>({id:`sold-${lot.lotId}`,text:`${lot.playerName} signed by ${lot.winningTeamName || 'a team'}`,time:lot.completedAtUtc || null})).sort((a,b)=>(b.time || '').localeCompare(a.time || '')).slice(0,10);
  const last=data?.state.lastResult;
  const baseline=last?.status==='UNSOLD'?[{id:`unsold-${last.lotId}`,text:`${last.playerName} went unsold`,time:last.completedAtUtc || null},...sold]:sold;
  return {onEvent,items:[...items,...baseline.filter(item=>!items.some(live=>live.text===item.text))].slice(0,20)};
}
