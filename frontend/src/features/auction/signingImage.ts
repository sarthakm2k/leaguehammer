import type { AuctionResults, ResultPlayer } from './resultsTypes';
import { formatCurrency } from '../../utils/formatters';
import { GOALKEEPER_ATTRIBUTES, OUTFIELD_ATTRIBUTES, isGoalkeeper } from '../players/playerCardTypes';

export function signingAccent(color?: string | null): string {
  if (!/^#[0-9a-f]{6}$/i.test(color ?? '')) return '#c4f143';
  const channels = [1,3,5].map(index => parseInt(color!.slice(index,index+2),16));
  const luminance = (values: number[]) => values.map(value => value/255).map(value => value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4).reduce((sum,value,index) => sum+value*[.2126,.7152,.0722][index],0);
  let result=channels;
  for (let blend=0;luminance(result)<.34 && blend<=1;blend+=.05) result=channels.map(value => Math.round(value+(255-value)*blend));
  return '#' + result.map(value => value.toString(16).padStart(2,'0')).join('');
}

export async function loadImage(url?: string | null): Promise<HTMLImageElement | null> {
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
export async function downloadSigningImage(data: AuctionResults, player: ResultPlayer, artworkSvg: string): Promise<boolean> {
  const team = data.state.teamStandings.find(t => t.teamId === player.winningTeamId);
  const [photo, crest, brand, artwork, avatar] = await Promise.all([loadImage(player.photoUrl), loadImage(team?.logoUrl), loadImage('/brand/leaguehammer.png'),loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(artworkSvg)}`),loadImage('/brand/player-avatar.svg')]);
  if (!artwork) throw new Error('Unable to render the player card artwork.');
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
  text('SIGNED.',66,415,150,'#f8f5ef',948,'left',true);
  // Reuse the on-screen SVG frame; draw safe CORS photos and editable card details
  // natively so the download needs no screenshot library or server rendering.
  drawPlayerCard(ctx,player,artwork,photo,avatar,180,460,720);
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

export function drawPlayerCard(ctx: CanvasRenderingContext2D, player: ResultPlayer, artwork: HTMLImageElement, photo: HTMLImageElement | null, avatar: HTMLImageElement | null, cardX: number, cardY: number, cardWidth: number) {
  const image = (img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.min(width/img.naturalWidth,height/img.naturalHeight);
    ctx.drawImage(img,x+(width-img.naturalWidth*scale)/2,y+(height-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale);
  };
  const cardHeight=cardWidth*1.5, gold='#f4d982';
  image(artwork,cardX,cardY,cardWidth,cardHeight);
  const cardText=(value:string,x:number,y:number,size:number,maxWidth:number,align:CanvasTextAlign='center',condensed=true) => {
    ctx.fillStyle=gold; ctx.textAlign=align; ctx.textBaseline='middle';
    let fontSize=size;
    const font=()=>`${condensed ? '' : '700 '}${fontSize}px ${condensed ? 'Impact,"Arial Narrow",Arial' : 'Arial'}`;
    ctx.font=font();
    while(ctx.measureText(value).width>maxWidth && fontSize>12) {fontSize--;ctx.font=font();}
    ctx.fillText(value,cardX+x*cardWidth,cardY+y*cardHeight,maxWidth);
    ctx.textBaseline='alphabetic';
  };
  const position=player.cardPosition || ({Goalkeeper:'GK',Defender:'DEF',Midfielder:'MID',Forward:'FWD'}[player.position || ''] ?? '');
  cardText(String(player.ratings?.overall ?? ''),.25,.23,cardWidth*.22,cardWidth*.24);
  cardText(position,.25,.335,cardWidth*.1,cardWidth*.24);
  ctx.strokeStyle=gold; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cardX+cardWidth*.45,cardY+cardHeight*.08); ctx.lineTo(cardX+cardWidth*.55,cardY+cardHeight*.08); ctx.lineTo(cardX+cardWidth*.54,cardY+cardHeight*.135); ctx.lineTo(cardX+cardWidth*.5,cardY+cardHeight*.16); ctx.lineTo(cardX+cardWidth*.46,cardY+cardHeight*.135); ctx.closePath();ctx.stroke();
  cardText('LH',.5,.115,cardWidth*.045,cardWidth*.09,'center',false);
  if(photo) image(photo,cardX+cardWidth*.32,cardY+cardHeight*.19,cardWidth*.59,cardHeight*.43);
  else if(avatar) image(avatar,cardX+cardWidth*.3554,cardY+cardHeight*.1771,cardWidth*.5192,cardHeight*.3784);
  else {
    // Even if the bundled avatar cannot load, the export retains a silhouette.
    ctx.fillStyle=gold; ctx.beginPath();ctx.arc(cardX+cardWidth*.615,cardY+cardHeight*.32,cardWidth*.075,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(cardX+cardWidth*.615,cardY+cardHeight*.48,cardWidth*.14,cardHeight*.1,0,0,Math.PI*2);ctx.fill();
  }
  if(player.jerseyNumber!=null) cardText(`#${player.jerseyNumber}`,.23,.45,cardWidth*.06,cardWidth*.2,'center',false);
  cardText(player.playerName.toUpperCase(),.5,.63,cardWidth*.1,cardWidth*.8);
  ctx.strokeStyle='#dabd7070'; ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(cardX+cardWidth*.18,cardY+cardHeight*.69);ctx.lineTo(cardX+cardWidth*.82,cardY+cardHeight*.69);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cardX+cardWidth*.5,cardY+cardHeight*.723);ctx.lineTo(cardX+cardWidth*.5,cardY+cardHeight*.87);ctx.stroke();
  const attributes=isGoalkeeper(player.cardPosition,player.position) ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES;
  attributes.forEach(([key,code],index)=>{
    const left=index<3; const row=index%3; const x=left ? .245 : .57;
    cardText(String(player.ratings?.attributes[key] ?? ''),x,.725+row*.055,cardWidth*.068,cardWidth*.075);
    cardText(code,x+.045,.725+row*.055,cardWidth*.064,cardWidth*.135,'left');
  });
  ctx.beginPath();ctx.moveTo(cardX+cardWidth*.26,cardY+cardHeight*.89);ctx.lineTo(cardX+cardWidth*.74,cardY+cardHeight*.89);ctx.stroke();
  cardText('LEAGUEHAMMER',.5,.91,cardWidth*.026,cardWidth*.48,'center',false);
}
