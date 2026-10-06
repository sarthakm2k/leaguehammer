export const CARD_POSITIONS = ['GK','CB','LB','RB','LWB','RWB','CDM','CM','CAM','LM','RM','LW','RW','CF','ST'] as const;
export interface RatingValues {
  pace?: number | null; shooting?: number | null; passing?: number | null; dribbling?: number | null; defending?: number | null; physical?: number | null;
  diving?: number | null; handling?: number | null; kicking?: number | null; reflexes?: number | null; speed?: number | null; positioning?: number | null;
}
export interface PlayerRatings { attributes: RatingValues; overall: number | null; isGoalkeeper: boolean }
export interface CardPlayer { playerName: string; photoUrl?: string | null; position?: string | null; cardPosition?: string | null; ratings?: PlayerRatings | null; jerseyNumber?: number | null }
export const OUTFIELD_ATTRIBUTES: [keyof RatingValues,string,string][] = [['pace','PAC','Pace'],['shooting','SHO','Shooting'],['passing','PAS','Passing'],['dribbling','DRI','Dribbling'],['defending','DEF','Defending'],['physical','PHY','Physical']];
export const GOALKEEPER_ATTRIBUTES: typeof OUTFIELD_ATTRIBUTES = [['diving','DIV','Diving'],['handling','HAN','Handling'],['kicking','KIC','Kicking'],['reflexes','REF','Reflexes'],['speed','SPD','Speed'],['positioning','POS','Positioning']];
export const isGoalkeeper = (cardPosition?: string | null, position?: string | null) => cardPosition ? cardPosition === 'GK' : position?.toLowerCase() === 'goalkeeper';
// LeagueHammer position weights; keep aligned with CardRatings.Weights in the API.
export const POSITION_WEIGHTS: Record<string, readonly number[]> = {
  ST:[20,35,10,20,5,10], CF:[15,30,20,25,5,5],
  LW:[30,20,15,25,5,5], RW:[30,20,15,25,5,5],
  LM:[25,10,25,25,5,10], RM:[25,10,25,25,5,10],
  CAM:[10,20,30,30,5,5], CM:[10,10,35,20,15,10], CDM:[10,5,25,10,30,20],
  CB:[10,5,10,5,45,25], LB:[20,5,20,10,30,15], RB:[20,5,20,10,30,15],
  LWB:[25,5,25,15,20,10], RWB:[25,5,25,15,20,10], GK:[25,20,5,30,5,15],
  BALANCED:[1,1,1,1,1,1],
};
export function ratingProfile(cardPosition?: string | null, position?: string | null): string {
  return cardPosition?.trim().toUpperCase() || ({goalkeeper:'GK',defender:'CB',midfielder:'CM',forward:'ST'}[position?.trim().toLowerCase() || ''] ?? 'BALANCED');
}
export function calculateOverall(values: RatingValues, cardPosition?: string | null, position?: string | null): number | null {
  const profile = ratingProfile(cardPosition,position);
  const weights = POSITION_WEIGHTS[profile] ?? POSITION_WEIGHTS.BALANCED;
  let total = 0, enteredWeight = 0;
  (profile === 'GK' ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES).forEach(([key],index) => {
    const value = values[key];
    if(value == null || !Number.isFinite(value)) return;
    total += value * weights[index]; enteredWeight += weights[index];
  });
  return enteredWeight ? Math.min(99,Math.max(1,Math.round(total/enteredWeight))) : null;
}
