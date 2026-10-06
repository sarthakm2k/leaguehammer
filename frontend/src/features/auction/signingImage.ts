import type { AuctionResults, ResultPlayer } from './resultsTypes';
import { formatCurrency } from '../../utils/formatters';

async function loadImage(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise(resolve => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 8000);
    img.crossOrigin = 'anonymous';
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

/** A standalone portrait PNG; remote images must permit anonymous CORS. */
export async function downloadSigningImage(data: AuctionResults, player: ResultPlayer): Promise<boolean> {
  const team = data.state.teamStandings.find(t => t.teamId === player.winningTeamId);
  const [photo, crest, brand] = await Promise.all([loadImage(player.photoUrl), loadImage(team?.logoUrl), loadImage('/brand/leaguehammer.png')]);
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image export is unavailable in this browser.');
  const accent = /^#[0-9a-f]{6}$/i.test(team?.primaryColor ?? '') ? team!.primaryColor : '#c4f143';
  const gradient = ctx.createLinearGradient(0,0,1080,1920); gradient.addColorStop(0,'#192d2b'); gradient.addColorStop(1,'#090e17');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,1080,1920);
  ctx.strokeStyle = accent; ctx.globalAlpha = .18; ctx.lineWidth = 3;
  for (const radius of [380,520,660]) { ctx.beginPath(); ctx.arc(1120,920,radius,0,Math.PI*2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const image = (img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.min(width/img.naturalWidth,height/img.naturalHeight);
    ctx.drawImage(img,x+(width-img.naturalWidth*scale)/2,y+(height-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
  };
  const text = (value: string, y: number, size: number, color = '#f7f3eb', weight = 800, maxWidth = 920) => {
    ctx.fillStyle = color; ctx.textAlign = 'center';
    let fontSize = size; ctx.font = `${weight} ${fontSize}px Arial`;
    while (ctx.measureText(value).width > maxWidth && fontSize > 20) { fontSize--; ctx.font = `${weight} ${fontSize}px Arial`; }
    ctx.fillText(value,540,y,maxWidth);
  };
  if (brand) image(brand,70,45,380,125);
  text(data.state.tournamentName,220,40,'#cbd5d1',700);
  text('MEET YOUR NEW SIGNING',310,43,accent);
  ctx.fillStyle = '#ffffff0e'; ctx.beginPath(); ctx.roundRect(180,360,720,800,40); ctx.fill();
  if (photo) image(photo,190,370,700,780);
  else { text(player.playerName.split(' ').map(p=>p[0]).slice(0,2).join(''),820,180,accent); }
  text(player.position || 'PLAYER',1225,32,accent);
  // Wrap long player names into two balanced lines before fitting the text.
  const words = player.playerName.split(/\s+/); ctx.font = '900 86px Arial';
  if (words.length > 1 && ctx.measureText(player.playerName).width > 920) {
    const middle = Math.ceil(words.length/2); text(words.slice(0,middle).join(' '),1320,78); text(words.slice(middle).join(' '),1405,78);
  } else text(player.playerName,1350,86);
  if (crest) image(crest,470,1440,140,140);
  text(player.winningTeamName || 'New team',1640,48);
  text('SIGNED FOR',1715,25,'#cbd5d1',700);
  text(formatCurrency(player.finalPrice ?? 0,data.state.currencyCode),1805,86,accent);
  text('AUCTION WRAPPED · THE NEXT CHAPTER STARTS HERE',1870,21,'#cbd5d1',600);
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to create your image.')), 'image/png'));
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  const filename = `${data.state.tournamentName}-${player.playerName}-signing`.replace(/[^a-z0-9_-]+/gi,'-').slice(0,160);
  anchor.href = url; anchor.download = `${filename}.png`; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url),60000);
  return !!player.photoUrl && !photo;
}
