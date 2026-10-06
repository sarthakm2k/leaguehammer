import { FootballPlayerCard } from './FootballPlayerCard';
import { CARD_POSITIONS, GOALKEEPER_ATTRIBUTES, OUTFIELD_ATTRIBUTES, POSITION_WEIGHTS, ratingProfile, calculateOverall, isGoalkeeper, type RatingValues } from './playerCardTypes';

export function PlayerRatingsEditor({ value, onChange, cardPosition, onPositionChange, position, name, photoUrl, disabled = false }: {
  value: RatingValues; onChange: (ratings: RatingValues) => void; cardPosition: string; onPositionChange?: (position: string) => void;
  position: string; name: string; photoUrl?: string; disabled?: boolean;
}) {
  const goalkeeper = isGoalkeeper(cardPosition,position);
  const overall = calculateOverall(value,cardPosition,position);
  const profile = ratingProfile(cardPosition,position);
  const attributes = goalkeeper ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES;
  const weights = POSITION_WEIGHTS[profile] ?? POSITION_WEIGHTS.BALANCED;
  return <fieldset className="player-ratings-editor" disabled={disabled}><legend>Player card &amp; ratings (optional)</legend>
    <p>Enter ratings from 1 to 99. Overall uses {profile === 'BALANCED' ? 'equal weights' : `${profile} position weights`}; blank attributes are excluded.</p>
    <details><summary>How overall is calculated</summary><p>Multiply each entered rating by its weight, divide by the total weight of entered attributes, then round. {attributes.map(([,code],index) => `${code} ${profile === 'BALANCED' ? 'equal' : `${weights[index]}%`}`).join(' · ')}. Without a card position, your playing position determines the profile.</p></details>
    {onPositionChange && <label>Card position<select aria-label="Card position" value={cardPosition} onChange={event => onPositionChange(event.target.value)}><option value="">Not specified</option>{CARD_POSITIONS.map(p => <option key={p}>{p}</option>)}</select></label>}
    <div className="player-ratings-layout"><div><div className="player-ratings-inputs">{attributes.map(([key,code,label]) => <label key={key}>{label} ({code})<input type="number" min={1} max={99} step={1} inputMode="numeric" value={value[key] ?? ''} onChange={event => {
      const number = event.target.value === '' ? null : Math.min(99,Math.max(1,Math.trunc(Number(event.target.value))));
      onChange({ ...value, [key]: number });
    }} /></label>)}</div><label className="player-overall-preview">Overall (automatic)<output aria-label="Calculated overall rating">{overall ?? ''}</output></label></div>
    <div className="player-card-preview"><FootballPlayerCard key={`${cardPosition}:${photoUrl}`} player={{ playerName:name || 'Your player', photoUrl, position, cardPosition, ratings:{attributes:value,overall,isGoalkeeper:goalkeeper} }} /></div></div>
  </fieldset>;
}
