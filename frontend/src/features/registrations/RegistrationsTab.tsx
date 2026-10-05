import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, RefreshCw, UserRoundCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { PlayerFields } from './PlayerFields';
import { registrationRequest } from './registrationApi';
import type { PlayerDetails, RegistrationEntry, RegistrationForm } from './registrationApi';
import './registration.css';

function localDate(s: string | null) {
  if (!s) return '';
  const date = new Date(s);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
interface SetOption { id: string; name: string }
interface TierOption { id: string; label: string; amount: number }
export function RegistrationsTab({ tournamentId, status }: { tournamentId: string; status: string }) {
  const { token } = useAuth();
  const [form, setForm] = useState<RegistrationForm | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [closed, setClosed] = useState(false);
  const [opens, setOpens] = useState(''); const [closes, setCloses] = useState(''); const [instructions, setInstructions] = useState('');
  const [entries, setEntries] = useState<RegistrationEntry[]>([]);
  const [sets, setSets] = useState<SetOption[]>([]); const [tiers, setTiers] = useState<TierOption[]>([]);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('PENDING'); const [search, setSearch] = useState('');
  const [review, setReview] = useState<RegistrationEntry | null>(null);
  const reviewPanel = useRef<HTMLElement>(null);
  const [details, setDetails] = useState<PlayerDetails | null>(null);
  const [setId, setSetId] = useState(''); const [price, setPrice] = useState('');
  const [reason, setReason] = useState(''); const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const root = `/api/tournaments/${tournamentId}`;
  const request = useCallback(<T,>(path: string, method = 'GET', data?: unknown) => registrationRequest<T>(`${root}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined,
  }), [root, token]);
  const applyForm = (f: RegistrationForm) => { setForm(f); setEnabled(f.enabled); setClosed(f.closedManually); setOpens(localDate(f.opensAtUtc)); setCloses(localDate(f.closesAtUtc)); setInstructions(f.instructions || ''); };
  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const [f, list, options, prices] = await Promise.all([
        request<RegistrationForm>('/registrations/settings'), request<RegistrationEntry[]>('/registrations'), request<SetOption[]>('/player-sets'), request<TierOption[]>('/base-price-tiers'),
      ]);
      applyForm(f); setEntries(list); setSets(options); setTiers(prices);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }, [request]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { reviewPanel.current?.scrollIntoView({ block: 'start' }); }, [review?.id]);
  const locked = status !== 'DRAFT' || !!form?.finalizedAtUtc;
  const action = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = (event: React.FormEvent) => {
    event.preventDefault(); void action(async () => {
      const f = await request<RegistrationForm>('/registrations/settings', 'PUT', {
        enabled, closedManually: closed, opensAtUtc: opens ? new Date(opens).toISOString() : null,
        closesAtUtc: closes ? new Date(closes).toISOString() : null, instructions,
      }); applyForm(f); setNotice('Registration settings saved.');
    });
  };
  const startReview = (r: RegistrationEntry) => {
    setReview(r); setDetails({ name: r.name, phone: r.phone, email: r.email || '', age: r.age?.toString() || '', position: r.position,
      preferredFoot: r.preferredFoot || '', jerseyNumber: r.jerseyNumber?.toString() || '', previousTeam: r.previousTeam || '', shortBio: r.shortBio || '' });
    setSetId(''); setPrice(''); setReason(''); setDuplicateConfirmed(false); setError('');
    if (r.hasPhoto) void request<{ photoUrl: string }>(`/registrations/${r.id}/photo`).then(value => {
      setReview(current => current?.id === r.id ? { ...current, photoUrl: value.photoUrl } : current);
    }).catch(e => setError((e as Error).message));
  };
  const decide = (approve: boolean) => void action(async () => {
    if (!review || !details) return;
    await request(`/registrations/${review.id}/review`, 'POST', { ...details, approve,
      email: details.email || null, age: details.age ? Number(details.age) : null, jerseyNumber: details.jerseyNumber ? Number(details.jerseyNumber) : null,
      playerSetId: setId || null, basePrice: price ? Number(price) : null, reason: reason || null, duplicateConfirmed,
    });
    setReview(null); setDetails(null); await load(); setNotice(approve ? 'Player approved and added to the registry.' : 'Submission rejected.');
  });
  const visible = entries.filter(r => (!filter || r.status === filter) && `${r.name} ${r.phone} ${r.email || ''}`.toLowerCase().includes(search.toLowerCase()));
  const link = form ? `${window.location.origin}/register/${form.slug}` : '';
  return <div className="registration-admin">
    <div className="registration-admin-heading"><div><span className="registration-eyebrow"><UserRoundCheck size={16} />PLAYER INTAKE</span><h2>Player registrations</h2><p>Collect applications, verify the details, and choose who enters the auction.</p></div><button type="button" onClick={() => void load()} disabled={busy}><RefreshCw size={16} />Refresh</button></div>
    {error && <p className="registration-error" role="alert">{error}</p>}{notice && <p className="registration-alert" role="status">{notice}</p>}
    <section className="registration-card"><h3>Registration form</h3>{locked && <p className="registration-alert">Registration configuration and review are locked.</p>}
      <form onSubmit={save}><fieldset disabled={locked || busy}>
        <label className="registration-consent"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /><span>Enable public player registration</span></label>
        <div className="registration-fields"><label>Opening time<input type="datetime-local" value={opens} onChange={e => setOpens(e.target.value)} required={enabled} /></label><label>Closing time<input type="datetime-local" value={closes} onChange={e => setCloses(e.target.value)} required={enabled} /></label><label className="registration-wide">Instructions for players<textarea rows={3} value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={2000} /></label></div>
        <p className="registration-muted">Enter dates in your device’s timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Players see the deadline in the tournament timezone: {form?.timeZone || '…'}.</p>
        <label className="registration-consent"><input type="checkbox" checked={closed} onChange={e => setClosed(e.target.checked)} /><span>Close submissions now (review remains available)</span></label>
        <button type="submit" className="registration-primary">Save registration settings</button>
      </fieldset></form>
      {form && <div className="registration-share"><span className="registration-status">{form.status}</span><input aria-label="Player registration link" readOnly value={link} /><button type="button" onClick={() => void navigator.clipboard.writeText(link).then(() => setNotice('Registration link copied.')).catch(() => setError('Select and copy the registration link.'))}><Copy size={16} />Copy link</button><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open form</a></div>}
      <p className="registration-muted">Manual entry and CSV import remain available in Player Registry. Submissions do not enter the auction until approved. Photos are optional{form && !form.photoUploadAvailable ? '; storage has not been configured yet' : ''}.</p>
    </section>
    <section className="registration-card"><div className="registration-admin-heading"><div><h3>Review queue</h3><p>{entries.filter(r => r.status === 'PENDING').length} pending · {entries.filter(r => r.status === 'APPROVED').length} approved · {entries.filter(r => r.status === 'REJECTED').length} rejected</p></div><button type="button" disabled={busy || locked || !form || entries.some(r => r.status === 'PENDING')} onClick={() => {
        if (window.confirm('Finalize registration? This closes the form and locks further review. Manual player entry remains available while the tournament is in draft.')) void action(async () => { applyForm(await request<RegistrationForm>('/registrations/finalize', 'POST')); setNotice('Registration finalized. You can now run the preflight checklist.'); });
      }}>Finalize registration</button></div>
      <div className="registration-fields"><label>Submission status<select value={filter} onChange={e => setFilter(e.target.value)}><option value="">All submissions</option>{['PENDING', 'APPROVED', 'REJECTED'].map(s => <option key={s}>{s}</option>)}</select></label><label>Search submissions<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, phone or email" /></label></div>
      <div className="registration-queue">{visible.map(r => <article className="registration-entry" key={r.id}>{r.photoUrl && <img src={r.photoUrl} alt={`${r.name} profile`} />}<div><strong>{r.name}</strong><span>{r.position} · {r.phone}</span>{r.email && <span>{r.email}</span>}<small>{new Date(r.submittedAtUtc).toLocaleString()}</small>{r.possibleDuplicate && <b className="registration-duplicate">Possible duplicate—verify before approval</b>}{r.reviewReason && <p>{r.reviewReason}</p>}</div><span className="registration-status">{r.status}</span>{r.status === 'PENDING' && <button disabled={locked || busy} onClick={() => startReview(r)}>Review submission</button>}</article>)}{!busy && visible.length === 0 && <p className="registration-muted">No submissions match this view.</p>}</div>
    </section>
    {review && details && <section ref={reviewPanel} className="registration-card registration-review" aria-label="Review player submission"><div className="registration-admin-heading"><h3>Review {review.name}</h3><button disabled={busy} onClick={() => setReview(null)}>Close review</button></div>
      {review.photoUrl && <img className="registration-review-photo" src={review.photoUrl} alt={`${review.name} submitted photo`} />}
      <form onSubmit={e => { e.preventDefault(); decide(true); }}><PlayerFields value={details} onChange={setDetails} disabled={busy || locked} />
        <div className="registration-fields"><label>Auction player set<select value={setId} onChange={e => setSetId(e.target.value)} required><option value="">Select a set</option>{sets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Base price<input aria-label="Base price" type="number" min={10} max={1000000000} value={price} onChange={e => setPrice(e.target.value)} list="registration-tiers" required /><datalist id="registration-tiers">{tiers.map(t => <option value={t.amount} key={t.id}>{t.label}</option>)}</datalist></label><label className="registration-wide">Review note / rejection reason<textarea rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} /></label></div>
        {(review.possibleDuplicate || error.startsWith('Possible duplicate')) && <label className="registration-consent registration-duplicate"><input type="checkbox" checked={duplicateConfirmed} onChange={e => setDuplicateConfirmed(e.target.checked)} /><span>I checked the possible duplicate and want to approve this player.</span></label>}
        {error && <p className="registration-error" role="alert">{error}</p>}
        <div className="registration-actions"><button className="registration-primary" disabled={busy || locked} type="submit">Approve & add player</button><button type="button" disabled={busy || locked} onClick={() => decide(false)}>Reject submission</button></div>
      </form><p className="registration-muted">The approved profile and photo appear in the auction. Phone and email stay in this private review queue.</p>
    </section>}
  </div>;
}
