import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Copy, Crown, Share2, Shield, Sparkles, Trophy, UserRound, X } from 'lucide-react';
import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { useAuth } from '../auth/AuthContext';
import type { AuctionResults, ResultPlayer } from './resultsTypes';
import { formatCurrency } from '../../utils/formatters';
import './wrapped.css';

const API = import.meta.env.VITE_API_BASE_URL || '';
type Slide = { id: string; label: string; tone: string; content: ReactNode; accent?: string };
const chunks = <T,>(items: T[], size: number): T[][] => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

function StoryPortrait({ name, url, crest = false }: { name: string; url?: string | null; crest?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`wrapped-portrait${crest ? ' wrapped-crest' : ''}`}>{url && !failed
    ? <img src={url} alt={name} onError={() => setFailed(true)} />
    : <><UserRound aria-hidden="true" /><span>{name.split(' ').map(part => part[0]).slice(0,2).join('')}</span></>}</div>;
}
function StoryHeading({ kicker, children }: { kicker: string; children: ReactNode }) {
  return <><p className="wrapped-kicker">{kicker}</p><h2 className="wrapped-headline">{children}</h2></>;
}
function PlayerRows({ players, money, start = 0 }: { players: ResultPlayer[]; money: (amount: number) => string; start?: number }) {
  return <ol className="wrapped-player-list" start={start + 1}>{players.map((player, index) => <li key={player.playerId} data-testid={`wrapped-player-${player.playerId}`}>
    <span className="wrapped-rank">{String(start + index + 1).padStart(2,'0')}</span><StoryPortrait key={player.photoUrl} name={player.playerName} url={player.photoUrl} />
    <div><strong>{player.playerName}</strong><small>{player.position || 'Player'} · {player.winningTeamName || player.playerSetName}</small></div>
    <b>{player.status === 'SOLD' ? money(player.finalPrice ?? 0) : 'Unsold'}</b>
  </li>)}</ol>;
}

export function buildWrappedSlides(data: AuctionResults): Slide[] {
  const { state, statistics: stats } = data;
  const money = (amount: number) => formatCurrency(amount, state.currencyCode);
  const sold = data.players.filter(p => p.status === 'SOLD').sort((a,b) => (b.finalPrice ?? 0) - (a.finalPrice ?? 0) || a.playerName.localeCompare(b.playerName));
  const teams = [...stats.teams].sort((a,b) => b.standing.totalSpent - a.standing.totalSpent || a.standing.teamName.localeCompare(b.standing.teamName));
  const highest = sold[0]?.finalPrice;
  const recordHolders = sold.filter(p => p.finalPrice === highest);
  const slides: Slide[] = [
    { id: 'intro', label: 'Your auction, wrapped', tone: 'lime', content: <div className="wrapped-intro"><p className="wrapped-kicker">The final whistle. A new beginning.</p><h1>{state.tournamentName}<span>AUCTION<br /><em>WRAPPED.</em></span></h1><div className="wrapped-intro-counts"><span><b>{stats.totalPlayers}</b>players</span><span><b>{teams.length}</b>franchises</span><span><b>{stats.soldPlayers}</b>signings</span></div><p className="wrapped-caption">Big bids. New colours. Your auction story.</p><Sparkles className="wrapped-intro-spark" aria-hidden="true" /></div> },
    { id: 'numbers', label: 'The big picture', tone: 'purple', content: <><StoryHeading kicker="01 / The big picture">A whole lot<br />of <em>ambition.</em></StoryHeading><div className="wrapped-number-feature"><small>Total invested in players</small><strong>{money(stats.totalSpent)}</strong></div><div className="wrapped-stat-grid"><span><b>{stats.soldPlayers}</b>players signed</span><span><b>{stats.unsoldPlayers}</b>finished unsold</span><span><b>{(stats.salePercentage ?? 0).toFixed(1)}%</b>sold at auction</span><span><b>{money(stats.averageSalePrice ?? 0)}</b>average signing</span></div><p className="wrapped-caption">Every player counted once. Every final outcome remembered.</p></> },
  ];
  for (const player of recordHolders) slides.push({ id: `record-${player.playerId}`, label: `${player.playerName} · Record signing`, tone: 'pink', content: <><StoryHeading kicker={recordHolders.length > 1 ? 'Joint record signing' : 'The record signing'}>The name that<br /><em>raised the roof.</em></StoryHeading><div className="wrapped-star"><StoryPortrait name={player.playerName} url={player.photoUrl} /><Crown aria-hidden="true" /><h3>{player.playerName}</h3><p>{player.position || 'Player'} · {player.winningTeamName}</p><strong>{money(player.finalPrice ?? 0)}</strong></div><div className="wrapped-mini-stats"><span>Base <b>{money(player.basePrice)}</b></span><span>Premium <b>{money((player.finalPrice ?? 0) - player.basePrice)}</b></span></div></> });
  for (const [index, players] of chunks(sold.slice(0,10),4).entries()) slides.push({ id: `headliners-${index + 1}`, label: `Headline signings ${index + 1}`, tone: 'blue', content: <><StoryHeading kicker={`The headline signings / ${index + 1}`}>They came.<br />They <em>commanded.</em></StoryHeading><PlayerRows players={players} money={money} start={index * 4} /><p className="wrapped-caption">The highest-priced signings, ranked by final sale price.</p></> });
  const lift = stats.highestPriceMultiplier;
  if (lift && lift.priceMultiplier != null) slides.push({ id: 'price-rise', label: 'The biggest price rise', tone: 'lime', content: <><StoryHeading kicker="Beyond the base price">Demand made<br />the <em>difference.</em></StoryHeading><div className="wrapped-number-feature"><strong>{lift.priceMultiplier.toFixed(2)}<em>×</em></strong><small>their starting price</small></div><div className="wrapped-feature-player"><StoryPortrait name={lift.playerName} url={lift.photoUrl} /><h3>{lift.playerName}</h3><p>{lift.winningTeamName}</p></div><div className="wrapped-mini-stats"><span>Started at <b>{money(lift.basePrice)}</b></span><span>Signed for <b>{money(lift.finalPrice ?? 0)}</b></span></div></> });
  const comebacks = sold.filter(p => p.attemptCount > 1);
  if (comebacks.length) slides.push({ id: 'comebacks', label: 'The comeback story', tone: 'purple', content: <><StoryHeading kicker="Another round. Another chance.">The story<br />wasn't <em>over.</em></StoryHeading><div className="wrapped-number-feature"><strong>{comebacks.length}</strong><small>players signed after returning to auction</small></div><div className="wrapped-feature-player"><StoryPortrait name={comebacks[0].playerName} url={comebacks[0].photoUrl} /><h3>{comebacks[0].playerName}</h3><p>{comebacks[0].attemptCount} attempts · {money(comebacks[0].finalPrice ?? 0)} · {comebacks[0].winningTeamName}</p></div><p className="wrapped-caption">The highest-priced comeback signing. Sometimes a second chance changes everything.</p></> });
  if (teams.length) slides.push({ id: 'spending', label: 'Teams that made their move', tone: 'pink', content: <><StoryHeading kicker="Building a contender">Teams that<br /><em>made their move.</em></StoryHeading><p className="wrapped-caption">The biggest investments in final squads.</p><ol className="wrapped-spenders">{teams.slice(0,3).map(team => <li key={team.standing.teamId}><StoryPortrait name={team.standing.teamName} url={team.standing.logoUrl} crest /><div><h3>{team.standing.teamName}</h3><p>{team.standing.currentSquadSize} players signed</p><b>{money(team.standing.totalSpent)}</b></div></li>)}</ol>{teams[0].standing.totalSpent > 0 && <p className="wrapped-caption">{teams.filter(t => t.standing.totalSpent === teams[0].standing.totalSpent).length > 1 ? 'Joint leaders share the highest total spend.' : `${teams[0].standing.teamName} led the spending.`}</p>}</> });
  for (const [index, positions] of chunks(stats.positions ?? [],4).entries()) slides.push({ id: `positions-${index + 1}`, label: `The squad balance ${index + 1}`, tone: 'blue', content: <><StoryHeading kicker="Every role. A new chapter.">From the back.<br />To the <em>front.</em></StoryHeading><div className="wrapped-role-list">{positions.map(position => <div key={position.position}><span><strong>{position.position}</strong><small>{position.playerCount} players signed</small></span><b>{money(position.totalSpent)}</b></div>)}</div><p className="wrapped-caption">Where the auction investment went, by playing position.</p></> });
  for (const team of teams) {
    const t = team.standing;
    const roster = sold.filter(p => p.winningTeamId === t.teamId);
    const pages = roster.length ? chunks(roster,3) : [[]];
    for (const [index, players] of pages.entries()) slides.push({ id: `team-${t.teamId}-${index + 1}`, label: `${t.teamName} · Squad ${index + 1}/${pages.length}`, tone: 'club', accent: /^#[0-9a-f]{6}$/i.test(t.primaryColor) ? t.primaryColor : '#c4f143', content: <>
      <p className="wrapped-kicker">The final squad / {t.shortName} / {index + 1} of {pages.length}</p><div className="wrapped-team-heading"><StoryPortrait name={t.teamName} url={t.logoUrl} crest /><h2>{t.teamName}</h2></div>
      <div className="wrapped-team-totals"><span><b>{t.currentSquadSize}</b>signed</span><span><b>{money(t.totalSpent)}</b>invested</span><span><b>{money(t.remainingPurse)}</b>left in purse</span></div>
      {players.length ? <PlayerRows players={players} money={money} start={index * 3} /> : <div className="wrapped-empty-squad"><Shield size={48} /><h3>A chapter still to write.</h3><p>No players were signed by this franchise.</p></div>}
      <p className="wrapped-caption">{t.currentSquadSize} / {t.maximumSquadSize} squad capacity · {Math.max(0,t.minimumSquadSize - t.currentSquadSize)} below minimum · Average signing {money(team.averagePlayerCost)}</p>
    </> });
  }
  const unsold = data.players.filter(p => p.status !== 'SOLD').sort((a,b) => a.playerName.localeCompare(b.playerName));
  for (const [index, players] of chunks(unsold,4).entries()) slides.push({ id: `unsold-${index + 1}`, label: `Final unsold players ${index + 1}`, tone: 'blue', content: <><StoryHeading kicker="Every outcome matters">Still part<br />of the <em>story.</em></StoryHeading><PlayerRows players={players} money={money} start={index * 4} /><p className="wrapped-caption">Players without a final signing. Their auction journey remains part of the record.</p></> });
  slides.push({ id: 'finale', label: 'Next chapter: on the pitch', tone: 'lime', content: <div className="wrapped-finale"><Trophy size={52} /><StoryHeading kicker="The squads are set.">Next chapter?<br /><em>On the pitch.</em></StoryHeading><p>{state.tournamentName}</p><div className="wrapped-intro-counts"><span><b>{stats.soldPlayers}</b>signings</span><span><b>{teams.length}</b>teams</span></div><p className="wrapped-caption">The bids are history.<br />The football is just beginning.</p></div> });
  return slides;
}

function WrappedStory({ data, publicView }: { data: AuctionResults; publicView: boolean }) {
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState('');
  const [fallback, setFallback] = useState('');
  const touch = useRef<{ x: number; y: number } | null>(null);
  const slides = buildWrappedSlides(data);
  const found = slides.findIndex(slide => slide.id === params.get('slide'));
  const index = found < 0 ? 0 : found;
  const slide = slides[index];
  const previousId = slides[index - 1]?.id;
  const nextId = slides[index + 1]?.id;
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest('input,select,textarea')) return;
      const target = event.key === 'ArrowRight' ? nextId : event.key === 'ArrowLeft' ? previousId : undefined;
      if (target) { event.preventDefault(); setParams({ slide: target }, { replace: true }); setMessage(''); setFallback(''); }
    };
    window.addEventListener('keydown', navigate);
    return () => window.removeEventListener('keydown', navigate);
  }, [previousId, nextId, setParams]);
  const move = (next: number) => {
    if (next < 0 || next >= slides.length) return;
    setParams({ slide: slides[next].id }, { replace: true }); setMessage(''); setFallback('');
  };
  const publicPath = `/live/${encodeURIComponent(data.state.slug)}/wrapped`;
  const publicUrl = new URL(publicPath, window.location.origin).href;
  const slideUrl = `${publicUrl}?slide=${encodeURIComponent(slide.id)}`;
  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setMessage('Link copied'); }
    catch { setFallback(url); setMessage('Select and copy the link'); }
  };
  const share = async () => {
    if (!navigator.share) return copy(publicUrl);
    try { await navigator.share({ title: `${data.state.tournamentName} Auction Wrapped`, text: 'The signings. The squads. Our auction story.', url: publicUrl }); }
    catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) await copy(publicUrl); }
  };
  const recapUrl = publicView ? `/live/${encodeURIComponent(data.state.slug)}/recap` : `/tournaments/${data.state.tournamentId}/recap`;
  return <main className="auction-wrapped"><div className="wrapped-frame" data-tone={slide.tone} style={{ '--wrapped-club': slide.accent || '#c4f143' } as CSSProperties}>
    <div className="wrapped-art" aria-hidden="true"><i /><i /><i /></div>
    <header className="wrapped-top"><div className="wrapped-progress" role="progressbar" aria-label="Auction Wrapped story progress" aria-valuemin={1} aria-valuemax={slides.length} aria-valuenow={index + 1}>{slides.map((item,i) => <span key={item.id} data-complete={i <= index} />)}</div><div className="wrapped-toolbar"><LeagueHammerBrand compact /><span data-theme-slot />{data.publicLiveViewEnabled && <button type="button" aria-label="Share Auction Wrapped" onClick={() => void share()}><Share2 size={18} /></button>}<Link to={recapUrl} aria-label="Close Wrapped and open recap"><X size={20} /></Link></div></header>
    <article className="wrapped-slide" key={slide.id} aria-label={slide.label} data-testid="wrapped-slide"
      onTouchStart={event => { const point = event.touches[0]; touch.current = { x: point.clientX, y: point.clientY }; }}
      onTouchEnd={event => { const point = event.changedTouches[0]; if (touch.current) { const dx = point.clientX - touch.current.x; const dy = point.clientY - touch.current.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) move(index + (dx < 0 ? 1 : -1)); } touch.current = null; }}>
      {slide.content}
    </article>
    <footer className="wrapped-bottom"><div className="wrapped-navigation"><button type="button" aria-label="Previous slide" disabled={index === 0} onClick={() => move(index - 1)}><ArrowLeft size={20} /></button><label><span className="sr-only">Jump to story slide</span><select aria-label="Jump to story slide" value={slide.id} onChange={e => move(slides.findIndex(s => s.id === e.target.value))}>{slides.map((item,i) => <option key={item.id} value={item.id}>{i + 1} / {slides.length} · {item.label}</option>)}</select></label><button type="button" aria-label="Next slide" disabled={index === slides.length - 1} onClick={() => move(index + 1)}><ArrowRight size={20} /></button></div><div className="wrapped-bottom-links"><span>Swipe or use arrows</span>{data.publicLiveViewEnabled ? <button onClick={() => void copy(slideUrl)}><Copy size={12} />Copy this slide</button> : <span>Members only</span>}</div>{message && <p role="status" className="wrapped-message">{message}</p>}{fallback && <input className="wrapped-copy-input" aria-label="Shareable Wrapped link" readOnly value={fallback} onFocus={e => e.target.select()} />}</footer>
  </div></main>;
}

export function AuctionWrappedPage({ publicView = false }: { publicView?: boolean }) {
  const { id, slug } = useParams(); const { token } = useAuth(); const key = publicView ? slug : id;
  const query = useQuery({ queryKey: ['auction-results', publicView, key, publicView ? null : token], enabled: !!key && (publicView || !!token),
    queryFn: async () => { const response = await fetch(`${API}/api/${publicView ? `public/tournaments/${key}` : `tournaments/${key}`}/results`, { headers: publicView ? {} : { Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error((await response.json()).detail || 'Auction Wrapped is unavailable.'); return response.json() as Promise<AuctionResults>; } });
  const data = query.data;
  useEffect(() => { const previous = document.title; if (data) document.title = `${data.state.tournamentName} Auction Wrapped`; return () => { document.title = previous; }; }, [data]);
  if (!data || query.isError) return <main className="wrapped-wait"><Sparkles size={42} /><h1>{query.isError ? 'Wrapped unavailable' : 'Unwrapping your auction…'}</h1><p>{query.error?.message || 'Your story is loading.'}</p>{query.isError && <button onClick={() => void query.refetch()}>Try again</button>}</main>;
  if (data.state.sessionStatus !== 'COMPLETED') return <main className="wrapped-wait"><Trophy size={42} /><h1>The story is still unfolding.</h1><p>Auction Wrapped opens when the auction is complete.</p><Link to={publicView ? `/live/${encodeURIComponent(data.state.slug)}` : `/tournaments/${data.state.tournamentId}/results`}>Follow the live auction</Link></main>;
  return <WrappedStory data={data} publicView={publicView} />;
}
