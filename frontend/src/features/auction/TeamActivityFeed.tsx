import type { ActivityItem } from './useAuctionActivity';

export function TeamActivityFeed({items}:{items:ActivityItem[]}) {
  return <details className="team-activity result-panel"><summary>Live activity <span>{items.length ? `${items.length} recent` : 'Waiting for updates'}</span></summary><p className="team-plan-note">Recent signings plus updates received while this page is open. Reconnecting refreshes the current results; this is not a complete auction audit.</p><ol>{items.map(item=><li key={item.id}><span>{item.text}</span>{item.time&&<time dateTime={item.time}>{new Date(item.time).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>}</li>)}</ol>{!items.length&&<p className="result-muted">Auction activity will appear here.</p>}</details>;
}
