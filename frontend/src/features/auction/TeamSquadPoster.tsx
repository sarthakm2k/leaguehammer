import './squad-poster.css';
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { PlayerCardArtwork } from '../players/FootballPlayerCard';
import type { AuctionResults } from './resultsTypes';
import type { TeamAuctionStandingDto } from './auctionTypes';
import { drawPlayerCard, loadImage, signingAccent } from './signingImage';
import { formatCurrency } from '../../utils/formatters';

export function TeamSquadPoster({ data, team }: { data: AuctionResults; team: TeamAuctionStandingDto }) {
  const artworkRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const roster = data.players.filter(player => player.status === 'SOLD' && player.winningTeamId === team.teamId).sort((a,b) => a.playerName.localeCompare(b.playerName));
  if (data.state.sessionStatus !== 'COMPLETED' || !roster.length) return null;
  const download = async () => {
    if (busy) return;
    setBusy(true); setMessage('Preparing your final squad poster?');
    try {
      const svg = artworkRef.current?.querySelector('svg')?.cloneNode(true) as SVGSVGElement | undefined;
      if (!svg) throw new Error('Artwork unavailable');
      svg.setAttribute('xmlns','http://www.w3.org/2000/svg'); svg.setAttribute('width','300'); svg.setAttribute('height','450');
      const [artwork, crest, avatar] = await Promise.all([loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`),loadImage(team.logoUrl),loadImage('/brand/player-avatar.svg')]);
      if (!artwork) throw new Error('Artwork could not load');
      const columns = roster.length === 1 ? 1 : roster.length === 2 ? 2 : 3, cardWidth = columns === 1 ? 600 : columns === 2 ? 420 : 300;
      const rowHeight = cardWidth*1.5+60, rows = Math.ceil(roster.length/columns);
      const logicalHeight = 400+rows*rowHeight+120, scale = Math.min(1,8000/logicalHeight);
      const canvas = document.createElement('canvas'); canvas.width=Math.round(1080*scale); canvas.height=Math.round(logicalHeight*scale);
      const ctx=canvas.getContext('2d'); if (!ctx) throw new Error('Export unavailable');
      ctx.scale(scale,scale);
      const accent=signingAccent(team.primaryColor), background=ctx.createLinearGradient(0,0,1080,logicalHeight);
      background.addColorStop(0,'#182b3c'); background.addColorStop(1,'#080c17');ctx.fillStyle=background;ctx.fillRect(0,0,1080,logicalHeight);
      ctx.save();ctx.globalAlpha=.1;ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(1080,0);ctx.lineTo(780,0);ctx.lineTo(0,logicalHeight);ctx.lineTo(300,logicalHeight);ctx.fill();ctx.restore();
      const text=(value:string,x:number,y:number,size:number,color='#ffffff',width=960,align:CanvasTextAlign='left')=>{ctx.fillStyle=color;ctx.textAlign=align;ctx.font=`800 ${size}px Arial`;while(ctx.measureText(value).width>width && size>14){size--;ctx.font=`800 ${size}px Arial`;}ctx.fillText(value,x,y,width);};
      if(crest){ const factor=Math.min(100/crest.naturalWidth,100/crest.naturalHeight);ctx.drawImage(crest,60+(100-crest.naturalWidth*factor)/2,54+(100-crest.naturalHeight*factor)/2,crest.naturalWidth*factor,crest.naturalHeight*factor); }
      else text(team.shortName,60,125,48,accent,130);
      text('THE FINAL SQUAD',190,94,24,accent,830);text(data.state.tournamentName,190,140,28,'#b6c4d8',830);
      text(team.teamName.toUpperCase(),60,235,64,'#ffffff');
      text(`${roster.length} SIGNINGS  /  ${formatCurrency(team.totalSpent,data.state.currencyCode)} INVESTED`,60,300,26,accent);
      ctx.fillStyle=accent;ctx.fillRect(60,337,960,3);
      let missingPhotos=0;
      for(let offset=0;offset<roster.length;offset+=columns){
        const players=roster.slice(offset,offset+columns), photos=await Promise.all(players.map(player=>loadImage(player.photoUrl)));
        for(let col=0;col<players.length;col++){
          const player=players[col], photo=photos[col];if(player.photoUrl&&!photo)missingPhotos++;
          const gap=(1080-columns*cardWidth)/(columns+1), x=(1080-players.length*cardWidth-(players.length-1)*gap)/2+col*(cardWidth+gap),y=380+(offset/columns)*rowHeight;
          drawPlayerCard(ctx,player,artwork,photo,avatar,x,y,cardWidth);
          text(formatCurrency(player.finalPrice || 0,data.state.currencyCode),x+cardWidth/2,y+cardWidth*1.5+28,24,accent,cardWidth,'center');
        }
      }
      text('NEW COLOURS. ONE SQUAD.',60,logicalHeight-55,25,accent);text('LEAGUEHAMMER / AUCTION WRAPPED',1020,logicalHeight-55,18,'#9daec6',460,'right');
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Export failed')),'image/png'));
      const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=`${data.state.tournamentName}-${team.teamName}-final-squad`.replace(/[^a-z0-9_-]+/gi,'-').slice(0,160)+'.png';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage(`Final squad poster downloaded.${missingPhotos ? ` ${missingPhotos} unavailable photos use avatars.` : ''}${team.logoUrl&&!crest ? ' Team logo unavailable; team initials used.' : ''}`);
    } catch { setMessage('Could not download the poster. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="team-poster-download"><div ref={artworkRef} hidden><PlayerCardArtwork /></div><button type="button" disabled={busy} onClick={()=>void download()}><Download size={16}/>{busy ? 'Preparing poster?' : 'Download final squad poster'}</button>{message && <span role="status">{message}</span>}</div>;
}
