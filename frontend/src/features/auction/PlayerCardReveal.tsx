import { Gavel } from 'lucide-react';
import { PlayerCardArtwork } from '../players/FootballPlayerCard';
import '../players/player-card.css';
import './player-reveal.css';

export function PlayerCardReveal({ lotId }: { lotId: string }) {
  return <div className="football-player-card auction-card-reveal" data-testid="auction-player-reveal" data-lot-id={lotId} role="status" aria-label="Revealing the next player">
    <div className="auction-card-spinner" aria-hidden="true">{[false,true].map(back => <div className={`auction-card-mystery${back ? ' auction-card-mirror' : ''}`} key={String(back)}>
      <PlayerCardArtwork /><div className="auction-mystery-brand"><Gavel /><strong>LEAGUE<span>HAMMER</span></strong><i>THE NEXT SIGNING</i></div>
    </div>)}</div>
    <span className="auction-reveal-caption">A new star awaits</span>
  </div>;
}

export function PlayerRevealMessage() {
  return <div className="auction-reveal-message"><p>THE NEXT SIGNING</p><h2>A new star<br />is about to land.</h2><span>Revealing the next player…</span></div>;
}
