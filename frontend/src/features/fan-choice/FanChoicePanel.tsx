import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Copy, Heart, LockKeyhole } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useAuctionSocket } from '../auction/useAuctionSocket';
import { fanRequest, type FanAdmin, type FanAdminPoll } from './fanChoiceApi';
import './fan-choice.css';

export function FanChoicePanel({ tournamentId, slug }: { tournamentId: string; slug: string }) {
  const { token } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<{ category: string; enabled: boolean } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const root = `/api/tournaments/${tournamentId}/fan-choice`;
  const headers = { Authorization: `Bearer ${token}` };
  const query = useQuery({ queryKey: ['fan-choice-admin', tournamentId, token], enabled: !!token, queryFn: ({ signal }) => fanRequest<FanAdmin>(root, { headers, signal }) });
  const { refetch } = query;
  const synchronize = useCallback(async () => { await refetch({ throwOnError: true, cancelRefetch: false }); }, [refetch]);
  useAuctionSocket(query.data?.publicLiveViewEnabled ? tournamentId : undefined, null, synchronize, undefined, undefined, 'fan-choice');
  const change = async (poll: FanAdminPoll, enabled: boolean, isOpen: boolean) => {
    if (busy) return;
    setBusy(poll.category); setPending({ category: poll.category, enabled }); setError('');
    try {
      await fanRequest(`${root}/${poll.category}`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, isOpen }) });
      await query.refetch({ throwOnError: true });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); setPending(null); }
  };
  const path = `/live/${encodeURIComponent(slug)}/fan-voting`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}${path}`); setCopied(true); }
    catch { setError('Could not copy the link. Select and copy it from the field below.'); }
  };
  return <section className="fan-choice-admin" aria-labelledby="fan-admin-title">
    <div className="fan-admin-header"><div><p className="fan-eyebrow"><Heart size={14} />Let the fans decide</p><h3 id="fan-admin-title">Fan Choice</h3><p>Five audience polls. Permanent votes, with live results after voting.</p></div><span className="fan-admin-label">Audience votes</span></div>
    {query.isPending && <p role="status">Loading voting controls…</p>}
    {query.isError && <p role="alert" className="fan-error">Could not load Fan Choice. <button type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    {query.data && <>
      {!query.data.publicLiveViewEnabled && <p className="fan-error">Enable Public Live View in Auction Rules &amp; Purse before opening public voting.</p>}
      <div className="fan-admin-polls">{query.data.polls.map(poll => <article key={poll.category}>
        <label><input type="checkbox" aria-label={`Enable ${poll.title}`} checked={pending?.category === poll.category ? pending.enabled : poll.enabled} disabled={!!busy} onChange={e => void change(poll, e.target.checked, false)} /><span><strong>{poll.title}</strong><small>{poll.optionCount} choices · {poll.voteCount} {poll.voteCount === 1 ? 'vote' : 'votes'} · {poll.isOpen ? 'Open' : poll.enabled ? 'Closed' : 'Disabled'}</small></span></label>
        <button type="button" disabled={!!busy || !poll.enabled || !query.data?.auctionCompleted || !query.data.publicLiveViewEnabled || (!poll.isOpen && poll.optionCount === 0)} onClick={() => void change(poll, true, !poll.isOpen)}>{busy === poll.category ? 'Saving…' : poll.isOpen ? `Close ${poll.title}` : `Open ${poll.title}`}</button>
      </article>)}</div>
      <p className="fan-admin-note"><LockKeyhole size={14} />Closing, disabling or reopening a category keeps its votes. Choices are fixed when voting first opens.</p>
      <div className="fan-admin-share"><label>Share the fan voting page<input readOnly value={`${location.origin}${path}`} onFocus={e => e.currentTarget.select()} /></label><div><button type="button" onClick={() => void copy()}><Copy size={15} />{copied ? 'Link copied' : 'Copy voting link'}</button><Link to={path} target="_blank" rel="noopener noreferrer">Preview voting page <ArrowUpRight size={15} /></Link></div></div>
    </>}
    {error && <p role="alert" className="fan-error">{error}</p>}
  </section>;
}
