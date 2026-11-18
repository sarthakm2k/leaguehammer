import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { RefreshCw, Users, Eye } from 'lucide-react';
import { LeagueHammerBrand } from '../../components/LeagueHammerBrand';
import { registrationRequest, REGISTRATION_API } from './registrationApi';
import './registration.css';
import './registration-viewer.css';

interface RegisteredPlayer {
  id:string; name:string; age:number|null; position:string; preferredFoot:string|null;
  status:string; submittedAtUtc:string; hasPhoto:boolean;
}
interface RegistrationList { tournamentName:string; timeZone:string; updatedAtUtc:string; players:RegisteredPlayer[] }
const statusLabel:Record<string,string> = {PENDING:'Pending review',APPROVED:'Approved',REJECTED:'Not selected'};
const pageSize = 24;

function RegistrationPhoto({ player, root }: { player:RegisteredPlayer; root:string }) {
  const [failed,setFailed] = useState(false);
  return <div className="registration-viewer-photo">{player.hasPhoto && !failed
    ? <img src={`${REGISTRATION_API}${root}/players/${player.id}/photo`} alt={player.name} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <img src="/brand/player-avatar.svg" alt={`${player.name} avatar`} />}</div>;
}

export function RegistrationViewerPage() {
  const {slug = '',viewToken = ''} = useParams();
  // Route changes remount the list so filters and photos cannot carry over between tournaments.
  return <RegistrationViewer key={`${slug}:${viewToken}`} slug={slug} viewToken={viewToken} />;
}

function RegistrationViewer({ slug,viewToken }: {slug:string;viewToken:string}) {
  const [search,setSearch] = useState('');
  const [status,setStatus] = useState('');
  const [page,setPage] = useState(1);
  const root = `/api/registration/${encodeURIComponent(slug)}/view/${encodeURIComponent(viewToken)}`;
  const query = useQuery({
    queryKey:['shared-registration-list',slug,viewToken],
    queryFn:({signal}) => registrationRequest<RegistrationList>(root,{signal,cache:'no-store'}),
    staleTime:Infinity,
    refetchInterval:false,
    refetchOnWindowFocus:false,
    refetchOnReconnect:false,
    retry:false,
  });
  const data = query.data;
  const matching = data?.players.filter(player => (!status || player.status === status) && `${player.name} ${player.position}`.toLowerCase().includes(search.trim().toLowerCase())) || [];
  const pages = Math.max(1,Math.ceil(matching.length/pageSize)), currentPage = Math.min(page,pages);
  const visible = matching.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const date = (value:string) => new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:data?.timeZone || 'UTC'}).format(new Date(value));
  const unavailable = query.isError && [403,404].includes((query.error as Error & {status?:number})?.status ?? 0);
  return <div className="registration-page registration-viewer-page">
    <header className="registration-header"><LeagueHammerBrand /><span data-theme-slot /></header>
    <main className="registration-viewer-main">
      <div className="registration-viewer-heading"><div><span className="registration-eyebrow"><Eye size={16} />VIEW ONLY</span><h1>{data?.tournamentName || 'Registered players'}</h1><p className="registration-muted">Registrations so far. Refresh the list to see the latest players.</p></div><button type="button" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={16} />{query.isFetching ? 'Refreshing…' : 'Refresh list'}</button></div>
      {query.isPending && <p role="status" className="registration-alert">Loading registered players…</p>}
      {query.isError && <p role="alert" className="registration-error">{unavailable ? 'This viewing link is unavailable. Ask the organiser for the correct link.' : 'The registration list could not be refreshed. Please try again.'}</p>}
      {data && !unavailable && <>
        <section className="registration-viewer-counts" aria-label="Registration counts"><div><Users size={20} /><strong>{data.players.length}</strong><span>Total registered</span></div>{['PENDING','APPROVED','REJECTED'].map(value => <div key={value}><strong>{data.players.filter(player => player.status === value).length}</strong><span>{statusLabel[value]}</span></div>)}</section>
        <div className="registration-viewer-filters"><label>Search players<input type="search" placeholder="Name or playing position" value={search} onChange={event => {setSearch(event.target.value);setPage(1);}} /></label><label>Registration status<select value={status} onChange={event => {setStatus(event.target.value);setPage(1);}}><option value="">All registrations</option>{Object.entries(statusLabel).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
        <div className="registration-viewer-update"><p>Updated {date(data.updatedAtUtc)} · {data.timeZone}</p><span role="status">{matching.length} {matching.length === 1 ? 'player' : 'players'}{search || status ? ' matching your filters' : ' registered'}</span></div>
        {!data.players.length ? <p className="registration-card">No players have registered yet. Refresh the list to check for new registrations.</p> : !matching.length ? <p className="registration-card">No players match your search or status filter.</p> : <section className="registration-viewer-grid" aria-label="Registered players">{visible.map(player => <article className="registration-viewer-player" key={player.id}>
          <RegistrationPhoto key={`${player.id}:${player.hasPhoto}:${data.updatedAtUtc}`} player={player} root={root} />
          <div><span className="registration-status" data-status={player.status}>{statusLabel[player.status] || player.status}</span><h2>{player.name}</h2><p>{player.position}{player.age == null ? '' : ` · Age ${player.age}`}{player.preferredFoot ? ` · ${player.preferredFoot} foot` : ''}</p><small>Registered {date(player.submittedAtUtc)}</small></div>
        </article>)}</section>}
        {pages > 1 && <nav className="registration-viewer-pagination" aria-label="Registration pages"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage-1)}>Previous</button><span>Page {currentPage} of {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage+1)}>Next</button></nav>}
      </>}
    </main>
    <footer className="registration-footer">LeagueHammer · Registered players · View only</footer>
  </div>;
}
