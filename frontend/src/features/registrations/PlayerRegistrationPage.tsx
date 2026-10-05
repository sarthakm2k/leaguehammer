import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock3, ShieldCheck, Trophy } from 'lucide-react';
import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { PlayerFields } from './PlayerFields';
import { blankPlayer, registrationRequest } from './registrationApi';
import type { PlayerDetails, Receipt, RegistrationForm } from './registrationApi';
import './registration.css';

interface Draft { details: PlayerDetails; submissionId: string; pending: boolean; hadPhoto: boolean }
function readDraft(key: string): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved?.submissionId && /^[0-9a-f-]{36}$/i.test(saved.submissionId) && saved.details) {
      const details = { ...blankPlayer };
      for (const k of Object.keys(details) as (keyof PlayerDetails)[]) if (typeof saved.details[k] === 'string') details[k] = saved.details[k];
      return { details, submissionId: saved.submissionId, pending: !!saved.pending, hadPhoto: !!saved.hadPhoto };
    }
  } catch { /* Private browsing can disable storage. */ }
  return { details: { ...blankPlayer }, submissionId: crypto.randomUUID(), pending: false, hadPhoto: false };
}
export function PlayerRegistrationPage() {
  const { slug = '' } = useParams();
  // Route navigation remounts the tournament-specific form and its isolated draft.
  return <RegistrationFormPage key={slug} slug={slug} />;
}
function RegistrationFormPage({ slug }: { slug: string }) {
  const key = `leaguehammer-registration-${slug}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(key));
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState('');
  const [now, setNow] = useState(Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const root = `/api/registration/${encodeURIComponent(slug)}`;
  useEffect(() => {
    let disposed = false; const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const connect = async () => {
      try {
        const value = await registrationRequest<RegistrationForm>(root, { signal: controller.signal });
        if (disposed) return;
        setForm(value); setClockOffset(Date.parse(value.serverTimeUtc) - Date.now()); setConnectionError(''); setConnecting(false);
      } catch (e) {
        if (disposed) return;
        if ((e as { status?: number }).status === 404) { setConnectionError('This tournament registration link could not be found.'); setConnecting(false); return; }
        setConnectionError('The registration service is starting or temporarily unavailable. We’ll reconnect automatically.');
        timer = setTimeout(() => { void connect(); }, 3000);
      }
    };
    void connect();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [root]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (receipt) return;
    try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* In-memory form remains usable. */ }
  }, [draft, key, receipt]);
  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return; }
    const url = URL.createObjectURL(photo); setPhotoPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo]);
  const confirm = (value: Receipt) => {
    setReceipt(value); setError(''); setPhoto(null);
    try { localStorage.removeItem(key); } catch { /* No stored draft. */ }
  };
  const checkReceipt = async () => {
    try { confirm(await registrationRequest<Receipt>(`${root}/receipts/${draft.submissionId}`)); return true; }
    catch (e) { if ((e as { status?: number }).status === 404) return false; throw e; }
  };
  useEffect(() => {
    if (!form || !draft.pending) return;
    let disposed = false;
    void registrationRequest<Receipt>(`${root}/receipts/${draft.submissionId}`).then(value => { if (!disposed) confirm(value); }).catch(() => { /* Retry button verifies again before posting. */ });
    return () => { disposed = true; };
    // Only recovery after loading a persisted pending submission.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.tournamentId]);
  const serverNow = now + clockOffset;
  const open = form && form.enabled && !form.closedManually && !form.finalizedAtUtc && form.status !== 'CLOSED' &&
    (!form.opensAtUtc || Date.parse(form.opensAtUtc) <= serverNow) && (!form.closesAtUtc || Date.parse(form.closesAtUtc) > serverNow);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('Checking your submission…');
    try {
      if (draft.pending && await checkReceipt()) return;
      if (!open) throw new Error('Registrations are closed. A previous submission can still be checked using its reference.');
      if (draft.hadPhoto && !photo) throw new Error('Please select your photo again. Browsers cannot restore a file selection after a refresh.');
      if (!consent) throw new Error('Please confirm consent to register.');
      const pending = { ...draft, pending: true, hadPhoto: !!photo || draft.hadPhoto };
      setDraft(pending);
      try { localStorage.setItem(key, JSON.stringify(pending)); } catch { /* Recovery remains available in this tab. */ }
      const body = new FormData(); body.set('submissionId', draft.submissionId); body.set('consent', 'true'); body.set('website', website);
      for (const [k, v] of Object.entries(draft.details)) if (v) body.set(k, v);
      if (photo) body.set('photo', photo);
      setNotice('Submitting your registration. Keep this page open while the service connects.');
      confirm(await registrationRequest<Receipt>(`${root}/submissions`, { method: 'POST', body }, 100000));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 413) setDraft(v => ({ ...v, pending: false }));
      setError(status || (e instanceof Error && e.name === 'Error') ? (e as Error).message : 'We could not confirm the submission. Your details are preserved. Retry safely—we’ll check for an existing submission first.');
    } finally { setBusy(false); setNotice(''); }
  };
  const date = (s: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: form?.timeZone || 'UTC' }).format(new Date(s));
  return <div className="registration-page">
    <header className="registration-header"><LeagueHammerBrand /><span data-theme-slot /></header>
    <main className="registration-layout">
      <section className="registration-intro"><span className="registration-eyebrow"><Trophy size={16} />PLAYER REGISTRATION</span><h1>{form?.tournamentName || 'Your next chapter starts here.'}</h1><p>Bring your game.<br /><em>Find your squad.</em></p><div className="registration-note"><ShieldCheck /><span>Your application goes to the tournament organisers for review. They assign your auction set and base price.</span></div>{form?.closesAtUtc && <div className="registration-deadline"><Clock3 /><div><small>Registration closes</small><strong>{date(form.closesAtUtc)}</strong><small>{form.timeZone}</small></div></div>}</section>
      <section className="registration-card">
        {receipt ? <div className="registration-success" role="status"><CheckCircle2 size={48} /><h2>You’re registered.</h2><p>Your application has been saved for organiser review. This does not yet confirm selection for the auction.</p><small>YOUR SUBMISSION REFERENCE</small><code>{receipt.reference}</code><p>Submitted {date(receipt.submittedAtUtc)}</p><button type="button" onClick={() => void navigator.clipboard.writeText(receipt.reference).then(() => setNotice('Reference copied.')).catch(() => setNotice('Select and copy the reference above.'))}>Copy reference</button>{notice && <p>{notice}</p>}</div> : <>
          <h2>Step onto the shortlist.</h2><p className="registration-muted">Tell us about yourself. Fields marked optional can be left blank.</p>
          {connecting && <div className="registration-alert" role="status">Connecting to registration… This may take about a minute when the service is waking up.</div>}
          {connectionError && <p className="registration-alert" role="status">{connectionError}</p>}
          {form?.instructions && <p className="registration-instructions">{form.instructions}</p>}
          {form && !open && <p className="registration-alert" role="status">{form.status === 'SCHEDULED' && form.opensAtUtc && serverNow < Date.parse(form.opensAtUtc) ? `Registration opens ${date(form.opensAtUtc)}.` : 'Registration is closed.'}</p>}
          {(open || draft.pending) && <form onSubmit={submit}>
            <PlayerFields value={draft.details} onChange={details => setDraft(v => ({ ...v, details }))} disabled={busy || draft.pending} />
            <label className="registration-photo">Player photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !form?.photoUploadAvailable} onChange={e => {
              const file = e.target.files?.[0] || null;
              if (file && (file.size > 3 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) { setError('Choose a JPEG, PNG or WebP photo up to 3 MB.'); e.target.value = ''; return; }
              setPhoto(file); setDraft(v => ({ ...v, hadPhoto: !!file })); setError('');
            }} /><small>{form?.photoUploadAvailable ? 'JPEG, PNG or WebP · Up to 3 MB. Pending photos are private.' : 'Photo uploads are not available yet. You can still register.'}</small>{photoPreview && <img src={photoPreview} alt="Selected player photo" />}</label>
            <label className="registration-honeypot" aria-hidden="true">Website<input value={website} onChange={e => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
            <label className="registration-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={busy} /><span>I confirm these details are accurate and consent to organiser review and publication of my approved player profile and photo. Contact details remain private.</span></label>
            {draft.pending && <p className="registration-muted">A submission is awaiting confirmation. Your details are locked to keep retries consistent. Reference: <code>LH-{draft.submissionId.replaceAll('-', '')}</code></p>}
            {error && <p className="registration-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
            <button className="registration-primary" disabled={busy || connecting} type="submit">{busy ? 'Confirming registration…' : draft.pending ? 'Check & retry submission' : 'Submit registration'}</button>
            {!draft.pending && <button type="button" className="registration-quiet" disabled={busy} onClick={() => { setDraft({ details: { ...blankPlayer }, submissionId: crypto.randomUUID(), pending: false, hadPhoto: false }); setPhoto(null); setConsent(false); }}>Clear draft</button>}
            <p className="registration-muted registration-draft-note">Your draft is saved in this browser until submission. Clear it when using a shared device. Keep this page open during a submission.</p>
          </form>}
        </>}
      </section>
    </main><footer className="registration-footer">LeagueHammer · Every player has a place to begin.</footer>
  </div>;
}
