import { useEffect, useRef, useState } from 'react';
import type { RegistrationEntry } from './registrationApi';

export function RegistrationApprovalDialog({ entry, reject, busy, locked, error, onCancel, onConfirm }: {
  entry:RegistrationEntry; reject:boolean; busy:boolean; locked:boolean; error:string;
  onCancel:()=>void; onConfirm:(reason:string)=>void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason,setReason] = useState('');
  useEffect(() => { const node=dialog.current; node?.showModal(); return () => node?.close(); },[]);
  return <dialog ref={dialog} className="registration-admin registration-approval-dialog" aria-labelledby="registration-approval-title" onCancel={event => {event.preventDefault();if (!busy) onCancel();}}>
    <h2 id="registration-approval-title">{reject ? `Reject ${entry.name}'s registration?` : `Undo approval for ${entry.name}?`}</h2>
    <p>{reject ? 'This marks the registration as Rejected and removes the player from Player Registry.' : 'This moves the registration back to Pending review and removes the player from Player Registry.'} Their registration details and submitted photo stay saved.</p>
    <form onSubmit={event => {event.preventDefault();if (!busy && !locked && (!reject || reason.trim())) onConfirm(reason.trim());}}>
      {reject && <div className="registration-fields"><label className="registration-wide">Reason for rejection<textarea autoFocus required maxLength={1000} rows={3} value={reason} onChange={event=>setReason(event.target.value)} disabled={busy || locked} /></label></div>}
      {error && <p className="registration-error" role="alert">{error}</p>}
      {locked && <p className="registration-alert">Registration review is locked.</p>}
      <div className="registration-actions"><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" className="registration-primary" disabled={busy || locked || (reject && !reason.trim())}>{busy ? 'Saving…' : reject ? 'Reject registration' : 'Undo approval'}</button></div>
    </form>
  </dialog>;
}
