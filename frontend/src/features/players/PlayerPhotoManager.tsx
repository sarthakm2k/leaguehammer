import { useState } from 'react';
import { Upload, Trash2, X, UserRound } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || '';
export function PlayerPhotoManager({ tournamentId, player, token, onSaved, onClose }: {
  tournamentId:string; player:{id:string;name:string;photoUrl:string|null}; token:string|null;
  onSaved:(url:string|null)=>void; onClose:()=>void;
}) {
  const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [failed,setFailed]=useState(false);
  const change=async(remove=false)=>{
    if(busy||!token||(!remove&&!file))return;
    if(remove&&!window.confirm(`Remove the photo from ${player.name}'s profile?`))return;
    setBusy(true);setError('');
    try {
      const form=new FormData();if(file)form.append('photo',file);
      const res=await fetch(`${API}/api/tournaments/${tournamentId}/players/${player.id}/photo`,{method:remove?'DELETE':'POST',headers:{Authorization:`Bearer ${token}`},body:remove?undefined:form});
      const body=await res.json().catch(()=>({}));if(!res.ok)throw new Error(body.detail||'Could not update the player photo. Please retry.');
      onSaved(body.photoUrl??null);onClose();
    }catch(err){setError(err instanceof Error?err.message:'Could not update the photo.');}
    finally{setBusy(false);}
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-label={`Manage photo for ${player.name}`} className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 p-5 space-y-4">
    <div className="flex justify-between items-center gap-3"><div><h2 className="text-lg font-bold">Player photo</h2><p className="text-sm text-slate-400">{player.name}</p></div><button type="button" aria-label="Close photo manager" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    <div className="h-48 rounded-xl bg-slate-800 flex items-center justify-center">{player.photoUrl&&!failed?<img src={player.photoUrl} alt={`${player.name} current photo`} className="w-full h-full object-contain" onError={()=>setFailed(true)}/>:<UserRound size={72} className="text-slate-500"/>}</div>
    <p className="text-xs text-slate-400">Upload JPEG, PNG or WebP, up to 3 MB. Removing a photo restores the player avatar.</p>
    <label className="block text-sm font-semibold">Choose player photo<input aria-label="Choose player photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} className="mt-2 block w-full text-sm" onChange={event=>{
      const value=event.target.files?.[0]??null;setError('');setFile(null);
      if(value&&(!['image/jpeg','image/png','image/webp'].includes(value.type)||value.size>3*1024*1024)){setError('Choose a JPEG, PNG or WebP photo up to 3 MB.');event.target.value='';return;}setFile(value);
    }}/></label>
    {error&&<p role="alert" className="text-rose-400 text-sm">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!file} onClick={()=>void change()} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 text-slate-950 px-4 py-2 text-sm font-bold disabled:opacity-50"><Upload size={16}/>{busy?'Saving...':player.photoUrl?'Replace photo':'Upload photo'}</button>{player.photoUrl&&<button type="button" disabled={busy} onClick={()=>void change(true)} className="inline-flex items-center gap-2 rounded-xl border border-rose-400/40 text-rose-400 px-4 py-2 text-sm"><Trash2 size={16}/>Remove photo</button>}</div>
  </section></div>;
}
