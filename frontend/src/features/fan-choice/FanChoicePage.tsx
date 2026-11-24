import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, Asterisk, Check, Crown, Heart, LockKeyhole, Moon, Search, Shield, Sparkles, Star, Sun, Trophy, Users } from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { useAuctionSocket } from '../auction/useAuctionSocket';
import { ensureFanIdentity, fanHeaders, fanRequest, fanRoot, readFanIdentity, type FanOption, type FanPage, type FanPoll } from './fanChoiceApi';
import './fan-choice.css';

const categoryIcons = { BEST_BUY: Star, STRONGEST_SQUAD: Shield, FAVOURITE_PLAYER: Heart, BEST_CAPTAIN: Crown, BEST_ICON: Sparkles };
const categoryTones = { BEST_BUY: 'lime', STRONGEST_SQUAD: 'blue', FAVOURITE_PLAYER: 'pink', BEST_CAPTAIN: 'gold', BEST_ICON: 'purple' };
const categoryShortNames: Record<string, string> = { BEST_BUY: 'Best buy', STRONGEST_SQUAD: 'Top squad', FAVOURITE_PLAYER: 'Fan favourite', BEST_CAPTAIN: 'Captains', BEST_ICON: 'Icons' };
const twoDigits = (value: number) => String(value).padStart(2, '0');

function readAppearance(): 'paper' | 'night' {
  try { return localStorage.getItem('fan-choice-appearance') === 'night' ? 'night' : 'paper'; }
  catch { return 'paper'; }
}

function Photo({ url, name, crest = false }: { url: string | null; name: string; crest?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`fan-photo${crest ? ' fan-crest' : ''}`}>
    {url && !failed ? <img src={url} alt={name} onError={() => setFailed(true)} loading="lazy" /> : crest ? <Shield aria-label={`${name} logo unavailable`} /> : <img src="/brand/player-avatar.svg" alt={`${name} avatar`} />}
  </div>;
}

function ConfirmVote({ option, title, busy, error, canVote, onCancel, onConfirm }: { option: FanOption; title: string; busy: boolean; error: string; canVote: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  useEffect(() => { if (!canVote && !busy) onCancel(); }, [canVote, busy, onCancel]);
  return <dialog className="fan-confirm" ref={dialog} aria-labelledby="fan-confirm-title" onCancel={e => { e.preventDefault(); if (!busy) onCancel(); }}>
    <div className="fan-confirm-top"><span className="fan-eyebrow">The final call</span><LockKeyhole size={20} /></div>
    <h2 id="fan-confirm-title">Lock your pick.</h2><p className="fan-confirm-category">{title}</p>
    <div className="fan-confirm-ticket"><Photo key={option.photoUrl} url={option.photoUrl} name={option.name} crest={!!option.squad}/><div><strong>{option.name}</strong><span>{option.subtitle}</span></div><Check size={20}/></div>
    <p>Your vote for <strong>{option.name}</strong> is permanent. You cannot change it or vote again in this category from this browser.</p>
    {error && <p role="alert" className="fan-error">{error}</p>}
    <div className="fan-confirm-actions"><button type="button" disabled={busy} onClick={onCancel}>Go back</button><button className="fan-primary" type="button" disabled={busy || !canVote} onClick={onConfirm}>{busy ? 'Saving your vote…' : 'Confirm permanent vote'}</button></div>
  </dialog>;
}

function Squad({ option }: { option: FanOption }) {
  if (!option.squad) return null;
  return <details className="fan-squad"><summary><Users size={14} />Meet the squad <span>{option.squad.length}<ArrowUpRight size={13}/></span></summary><ul>{option.squad.map((p, i) => <li key={i}><strong>{p.name}</strong><span>{p.role === 'CAPTAIN' ? 'Captain' : p.role === 'ICON' ? 'Icon player' : p.position || 'Player'}</span></li>)}</ul></details>;
}

function Poll({ poll, currency, busy, error, onVote }: { poll: FanPoll; currency: string; busy: boolean; error: string; onVote: (option: FanOption) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(24);
  const voted = !!poll.selectedOptionId;
  const showResults = poll.totalVotes !== null;
  const finalResults = !poll.isOpen && showResults;
  const choices = poll.options.filter(o => `${o.name} ${o.subtitle}`.toLowerCase().includes(search.trim().toLowerCase()));
  if (showResults) choices.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name));
  const selectedOption = poll.options.find(o => o.id === (voted ? poll.selectedOptionId : selected));
  const highest = Math.max(0, ...poll.options.map(o => o.votes ?? 0));
  const leaders = poll.options.filter(o => o.votes === highest && highest > 0).length;
  return <section className="fan-poll" aria-labelledby="fan-poll-title">
    <div className="fan-poll-heading"><div><p className="fan-eyebrow">{finalResults ? 'Final results' : showResults ? 'The live race' : 'The nominees'}</p><h2 id="fan-poll-title">{poll.title}<span>.</span></h2><p>{poll.description}</p></div><span className={`fan-state${poll.isOpen ? ' is-open' : ''}`}><i />{poll.isOpen ? 'Voting open' : 'Voting closed'}</span></div>
    {showResults ? <div className="fan-voted-banner"><span className="fan-voted-check">{voted ? <Check size={18}/> : <Trophy size={18}/>}</span><div><strong>{voted ? 'Ballot sealed.' : 'Final results'}</strong><p>{voted ? <>{selectedOption?.name} <span>· Your permanent pick</span></> : 'Voting has closed. Here is the crowd’s verdict.'}</p></div><div className="fan-total" aria-live="polite"><b>{poll.totalVotes?.toLocaleString()}</b><span>votes cast</span></div></div>
      : poll.isOpen && <p className="fan-rule"><LockKeyhole size={13} />One pick. Locked for good. Vote to reveal the live standings.</p>}
    {!showResults && !poll.isOpen && <div className="fan-empty">{poll.options.length ? 'Voting is closed. Refresh to load the published results.' : 'The organiser has not opened this category yet.'}</div>}
    {finalResults && poll.totalVotes === 0 && <p className="fan-empty" role="status">No votes were received for this category.</p>}
    <label className="fan-search"><Search size={18} /><span className="fan-sr-only">Search {poll.title}</span><input type="search" value={search} onChange={e => { setSearch(e.target.value); setLimit(24); }} placeholder={poll.category === 'STRONGEST_SQUAD' ? 'Find your team…' : 'Find a player or team…'} /></label>
    {error && <p role="alert" className="fan-error">{error}</p>}
    {showResults && <div className="fan-race-label"><span>{finalResults ? 'FINAL STANDINGS' : 'THE LEADERBOARD'}</span><span>FAN VOTES ONLY <span aria-hidden="true">↗</span></span></div>}
    <div className={`fan-options${showResults ? ' fan-results' : ''}`}>{choices.slice(0, limit).map(option => {
      const rank = 1 + poll.options.filter(o => (o.votes ?? 0) > (option.votes ?? 0)).length;
      const leading = showResults && highest > 0 && option.votes === highest;
      const ownPick = (showResults ? poll.selectedOptionId : selected) === option.id;
      const number = twoDigits(poll.options.findIndex(o => o.id === option.id) + 1);
      return <article key={option.id} className={`fan-option${ownPick ? ' is-selected' : ''}${leading ? ' is-leading' : ''}`} data-testid={`fan-option-${option.id}`}>
        {showResults ? <>
          <span className="fan-rank" aria-label={(option.votes ?? 0) > 0 ? `Rank ${rank}` : 'No votes'}>{(option.votes ?? 0) > 0 ? twoDigits(rank) : '—'}</span>
          <div className="fan-result-person"><Photo key={option.photoUrl} url={option.photoUrl} name={option.name} crest={!!option.squad}/><div className="fan-option-copy"><h3>{option.name}</h3><p>{option.subtitle || 'Tournament player'}</p><div className="fan-result-tags">{leading && <span className="fan-leading"><Trophy size={11}/>{finalResults ? leaders > 1 ? 'Joint winner' : 'Winner' : leaders > 1 ? 'Joint lead' : 'Leading'}</span>}{ownPick && <span className="fan-your-vote"><Check size={11}/>Your vote</span>}</div></div></div>
          <div className="fan-result-detail"><strong>{(option.percentage ?? 0).toFixed(1)}<small>%</small></strong><span>{option.votes ?? 0} {(option.votes ?? 0) === 1 ? 'vote' : 'votes'}</span></div>
          <div className="fan-result-track" role="progressbar" aria-label={`${option.name} fan votes`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={option.percentage ?? 0}><span style={{ width: `${option.percentage ?? 0}%` }}/></div>
        </> : <button type="button" className="fan-option-main" aria-label={`Select ${option.name}`} aria-pressed={selected === option.id} disabled={!poll.isOpen || busy} onClick={() => setSelected(option.id)}>
          <div className="fan-card-meta"><span>NOMINEE / {number}</span><span className="fan-select-mark" aria-hidden="true">{selected === option.id ? <Check size={12}/> : <ArrowUpRight size={13}/>}</span></div>
          <div className="fan-portrait-stage"><span className="fan-portrait-number" aria-hidden="true">{number}</span><Photo key={option.photoUrl} url={option.photoUrl} name={option.name} crest={!!option.squad}/></div>
          <div className="fan-option-copy"><h3>{option.name}</h3><p>{option.subtitle || 'Tournament player'}</p><div className="fan-card-bottom">{poll.category === 'BEST_BUY' && option.price != null ? <span className="fan-price">{formatCurrency(option.price, currency)}<small>auction price</small></span> : <span className="fan-card-prompt">Back your {option.squad ? 'team' : 'pick'}</span>}<span className="fan-card-arrow" aria-hidden="true">{ownPick ? <Check size={17}/> : <ArrowRight size={17}/>}</span></div></div>
        </button>}
        <Squad option={option}/>
      </article>;
    })}</div>
    {!choices.length && poll.options.length > 0 && <p className="fan-empty">No matches. Try another name or team.</p>}
    {choices.length > limit && <button type="button" className="fan-more" onClick={() => setLimit(n => n + 24)}>Show more choices ({choices.length - limit} remaining)</button>}
    {!voted && poll.isOpen && selectedOption && <div className="fan-vote-dock"><span className="fan-dock-check"><Check size={18}/></span><div><small>Ready to make it official?</small><strong>{selectedOption.name}</strong></div><button type="button" className="fan-primary" disabled={busy} onClick={() => onVote(selectedOption)}>Review vote <ArrowUpRight size={16} /></button></div>}
  </section>;
}

export function FanChoicePage() {
  const { slug = '' } = useParams();
  return <FanChoiceTournament key={slug} slug={slug} />;
}

function FanChoiceTournament({ slug }: { slug: string }) {
  const [params, setParams] = useSearchParams();
  const [token, setToken] = useState(() => readFanIdentity(slug));
  const [confirmation, setConfirmation] = useState<{ pollId: string; option: FanOption; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appearance, setAppearance] = useState(readAppearance);
  const toggleAppearance = () => { const next = appearance === 'paper' ? 'night' : 'paper'; setAppearance(next); try { localStorage.setItem('fan-choice-appearance', next); } catch { /* Appearance remains available without storage. */ } };
  const cache = useQueryClient();
  const key = ['fan-choice', slug, token];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => fanRequest<FanPage>(fanRoot(slug), { signal, headers: fanHeaders(token) }), retry: (count, e) => (e as Error & { status?: number }).status !== 404 && count < 2 });
  const { refetch } = query;
  const synchronize = useCallback(async () => { await refetch({ throwOnError: true, cancelRefetch: false }); }, [refetch]);
  const available = !query.isError && !!query.data;
  const connection = useAuctionSocket(available ? query.data?.tournamentId : undefined, null, synchronize, undefined, undefined, 'fan-choice');
  useEffect(() => { const changed = () => setToken(readFanIdentity(slug)); window.addEventListener('storage', changed); return () => window.removeEventListener('storage', changed); }, [slug]);
  const vote = async () => {
    if (!confirmation || busy) return;
    setBusy(true); setError('');
    let identity: string | null = null;
    try {
      identity = await ensureFanIdentity(slug); setToken(identity);
      const data = await fanRequest<FanPage>(`${fanRoot(slug)}/${confirmation.pollId}/votes`, { method: 'POST', headers: { ...fanHeaders(identity), 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId: confirmation.option.id }) });
      await cache.cancelQueries({ queryKey: ['fan-choice', slug, identity] });
      cache.setQueryData(['fan-choice', slug, identity], data); setConfirmation(null);
    } catch (e) {
      setError((e as Error).message);
      if (identity) {
        try {
          // A response can be lost after the permanent vote commits. Restore its receipt before retrying.
          const data = await fanRequest<FanPage>(fanRoot(slug), { headers: fanHeaders(identity) });
          cache.setQueryData(['fan-choice', slug, identity], data);
          if (data.polls.find(p => p.id === confirmation.pollId)?.selectedOptionId) { setConfirmation(null); setError(''); }
        } catch { /* Keep the original error and the saved identity for a safe retry. */ }
      }
    } finally { setBusy(false); }
  };
  const data = query.data;
  const active = data?.polls.find(p => p.category === params.get('category')) ?? data?.polls[0];
  const next = data?.polls.find(p => p.isOpen && !p.selectedOptionId && p.id !== active?.id);
  const resultsOnly = !!data?.polls.some(p => p.totalVotes !== null) && data.polls.every(p => !p.isOpen);
  return <main className="fan-choice-page" data-fan-theme={appearance}><div className="fan-shell">
    <header className="fan-topbar"><Link className="fan-wordmark" to={`/live/${encodeURIComponent(slug)}`}><span className="fan-monogram"><Asterisk size={27}/></span><span>fanchoice<span className="fan-wordmark-dot">.</span><small>BY LEAGUEHAMMER</small></span></Link><div><span data-theme-slot hidden/><button type="button" className="fan-appearance" onClick={toggleAppearance} aria-label={`Switch Fan Choice to ${appearance === 'paper' ? 'night' : 'paper'} mode`}>{appearance === 'paper' ? <Moon size={17}/> : <Sun size={17}/>}</button><Link className="fan-back-link" to={`/live/${encodeURIComponent(slug)}`} aria-label="Back to tournament"><ArrowLeft size={16}/><span>Tournament</span></Link></div></header>
    {query.isPending ? <div className="fan-empty" role="status">Getting the fan zone ready…</div> : query.isError ? <div className="fan-unavailable"><LockKeyhole size={32} /><h1>Fan Choice unavailable</h1><p role="alert">{query.error.message}</p><button type="button" className="fan-primary" onClick={() => void query.refetch()}>Try again</button></div> : data && <>
      <section className="fan-hero"><div className="fan-hero-copy"><p className="fan-eyebrow"><span/>Fan Choice · {resultsOnly ? 'Final results' : 'Audience votes'}</p><h1>{resultsOnly ? <>The fans<br/><em>have spoken.</em></> : <>Back your<br/><em>favourites.</em></>}</h1><p className="fan-event-name">{data.tournamentName}</p><span className="fan-disclaimer">{resultsOnly ? 'The votes are in. This is your verdict.' : "Your picks. The people's verdict."}</span></div><div className="fan-hero-ticket" aria-hidden="true"><ArrowUpRight size={30}/><strong>FAN<br/>{resultsOnly ? 'PICKS.' : 'PASS.'}</strong><span>THE PEOPLE'S PICKS</span><div className="fan-ticket-barcode"/></div><Asterisk className="fan-hero-asterisk" size={85} aria-hidden="true"/></section>
      <div className="fan-section-label"><span><i/>{resultsOnly ? 'THE FINAL VERDICT' : 'YOUR BALLOT'}</span><span>{resultsOnly ? `${data.polls.length} categories` : `${data.polls.filter(p => p.selectedOptionId).length}/${data.polls.length} voted`}</span></div>
      <nav className="fan-categories" aria-label="Fan Choice categories">{data.polls.map((poll, i) => {
        const Icon = categoryIcons[poll.category as keyof typeof categoryIcons] ?? Star;
        return <button key={poll.id} type="button" aria-label={poll.title} data-tone={categoryTones[poll.category as keyof typeof categoryTones]} className={active?.id === poll.id ? 'is-active' : ''} aria-pressed={active?.id === poll.id} onClick={event => { setParams({ category: poll.category }); setError(''); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}><span className="fan-category-index">{twoDigits(i + 1)}</span><span className="fan-category-icon"><Icon size={16}/></span><strong>{categoryShortNames[poll.category] ?? poll.title}</strong>{poll.selectedOptionId && <Check className="fan-category-done" size={13} aria-label="Voted"/>}</button>;
      })}</nav>
      <div className="fan-connection" role="status"><span><i className={connection === 'connected' ? 'is-live' : ''}/>{connection === 'connected' ? resultsOnly ? 'Final results published' : 'Connected to the crowd' : 'Reconnecting to the crowd…'}</span><button type="button" onClick={() => void query.refetch()}>Refresh <ArrowUpRight size={11}/></button></div>
      {active && <Poll key={active.id} poll={active} currency={data.currencyCode} busy={busy} error={confirmation ? '' : error} onVote={option => { setError(''); setConfirmation({ pollId: active.id, title: active.title, option }); }} />}
      {active?.selectedOptionId && next && <button className="fan-next" type="button" onClick={() => setParams({ category: next.category })}><span><small>ANOTHER CATEGORY. ANOTHER CALL.</small>{next.title}</span><span className="fan-next-arrow"><ArrowUpRight size={22}/></span></button>}
      <footer className="fan-footer"><div className="fan-footer-brand"><Asterisk size={22}/><span>For the love<br/>of the game.</span></div><p>{resultsOnly ? 'Final Fan Choice results. Audience opinions, separate from official tournament awards.' : 'Fan votes, not official awards. One permanent vote per browser in each category. Using another browser or clearing its storage can allow another vote.'}</p></footer>
    </>}
  </div>{confirmation && <ConfirmVote option={confirmation.option} title={confirmation.title} busy={busy} error={error} canVote={!!data?.polls.find(p => p.id === confirmation.pollId && p.isOpen && !p.selectedOptionId) && !query.isError} onCancel={() => { setConfirmation(null); setError(''); }} onConfirm={() => void vote()} />}</main>;
}
