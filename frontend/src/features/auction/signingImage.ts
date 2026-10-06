import type { AuctionResults, ResultPlayer } from './resultsTypes';
import { formatCurrency } from '../../utils/formatters';

export function signingAccent(color?: string | null): string {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) return '#c4f143';
  const channels = [1,3,5].map(index => parseInt(color!.slice(index,index+2),16));
  const luminance = (values: number[]) => values.map(value => value/255).map(value => value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
  let result=channels;
  for (let blend=0;luminance(result)<.34 && blend<=1;blend+=.05) result=channels.map(value => Math.round(value+(255-value)*blend));
  return '#' + result.map(value => value.toString(16).padStart(2,'0')).join('');
}

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
  const accent = signingAccent(team?.primaryColor);
  const background = ctx.createLinearGradient(0,0,1080,1920);
  background.addColorStop(0,'#17202a'); background.addColorStop(1,'#080d14');
  ctx.fillStyle = background; ctx.fillRect(0,0,1080,1920);
  // Quiet diagonal club colour and print texture, with generous safe margins.
  ctx.save(); ctx.translate(1040,420); ctx.rotate(.5); ctx.globalAlpha=.09;
  ctx.fillStyle=accent; ctx.fillRect(-60,-800,170,2400); ctx.fillRect(150,-800,12,2400); ctx.restore();
  ctx.fillStyle='#ffffff'; ctx.globalAlpha=.035;
  for (let y=0;y<1920;y+=13) for (let x=0;x<1080;x+=13) ctx.fillRect(x+(y%7),y,1,1);
  ctx.globalAlpha=1;
  const image = (img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.min(width/img.naturalWidth,height/img.naturalHeight);
    ctx.drawImage(img,x+(width-img.naturalWidth*scale)/2,y+(height-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
  };
  const text = (value: string, x: number, y: number, size: number, color='#f8f5ef', maxWidth=928, align: CanvasTextAlign='left', italic=false) => {
    ctx.fillStyle=color; ctx.textAlign=align;
    let fontSize=size; const font=() => `${italic ? 'italic ' : ''}900 ${fontSize}px Arial`;
    ctx.font=font();
    while (ctx.measureText(value).width>maxWidth && fontSize>20) { fontSize--; ctx.font=font(); }
    ctx.fillText(value,x,y,maxWidth);
  };
  if (brand) image(brand,76,54,360,110);
  text('CONFIRMED',1004,123,24,accent,300,'right');
  ctx.fillStyle=accent; ctx.beginPath(); ctx.arc(820,115,7,0,Math.PI*2); ctx.fill();
  text(data.state.tournamentName,76,208,31,'#b8c1c8');
  text('MEET YOUR NEW SIGNING',76,288,24,'#b8c1c8');
  text('SIGNED.',66,435,200,'#f8f5ef',948,'left',true);
  // The photograph is never cropped or overlaid with player details.
  ctx.fillStyle='#ffffff05'; ctx.beginPath(); ctx.roundRect(76,484,928,800,[8,48,8,48]); ctx.fill();
  ctx.strokeStyle='#ffffff22'; ctx.lineWidth=2; ctx.stroke();
  if (photo) image(photo,102,510,876,748);
  else text(player.playerName.split(' ').map(p=>p[0]).slice(0,2).join(''),540,930,190,accent,800,'center');
  ctx.strokeStyle=accent; ctx.lineWidth=5;
  ctx.beginPath(); ctx.moveTo(76,552); ctx.lineTo(76,484); ctx.lineTo(144,484); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(936,1284); ctx.lineTo(1004,1284); ctx.lineTo(1004,1216); ctx.stroke();
  text((player.position || 'PLAYER').toUpperCase(),76,1348,25,accent);
  const words=player.playerName.trim().split(/\s+/); ctx.font='900 110px Arial';
  if (words.length>1 && ctx.measureText(player.playerName).width>928) {
    // Choose the word break that gives the two lines the most even widths.
    let middle=1; let difference=Infinity;
    for (let index=1;index<words.length;index++) {
      const gap=Math.abs(ctx.measureText(words.slice(0,index).join(' ')).width-ctx.measureText(words.slice(index).join(' ')).width);
      if (gap<difference) { middle=index; difference=gap; }
    }
    text(words.slice(0,middle).join(' '),76,1452,98);
    text(words.slice(middle).join(' '),76,1558,98);
  } else text(player.playerName,76,1490,110);
  ctx.strokeStyle='#ffffff35'; ctx.lineWidth=2;
  for (const y of [1608,1810]) { ctx.beginPath(); ctx.moveTo(76,y); ctx.lineTo(1004,y); ctx.stroke(); }
  ctx.fillStyle='#ffffff08'; ctx.beginPath(); ctx.roundRect(76,1650,104,104,22); ctx.fill();
  if (crest) image(crest,86,1660,84,84);
  else text(team?.shortName || 'FC',128,1716,31,accent,80,'center');
  text('NEW COLOURS',208,1665,19,'#b8c1c8',430);
  text(player.winningTeamName || 'New team',208,1724,39,'#f8f5ef',420);
  text('SIGNED FOR',1004,1665,19,'#b8c1c8',355,'right');
  text(formatCurrency(player.finalPrice ?? 0,data.state.currencyCode),1004,1740,76,accent,355,'right');
  text('AUCTION WRAPPED',76,1870,19,'#94a0ab',420);
  text('NEW CLUB. NEW CHAPTER.',1004,1870,19,'#94a0ab',450,'right');
  const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to create your image.')), 'image/png'));
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  const filename = `${data.state.tournamentName}-${player.playerName}-signing`.replace(/[^a-z0-9_-]+/gi,'-').slice(0,160);
  anchor.href = url; anchor.download = `${filename}.png`; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url),60000);
  return !!player.photoUrl && !photo;
}
