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
export function calculateOverall(values: RatingValues, goalkeeper: boolean): number | null {
  const entered = (goalkeeper ? GOALKEEPER_ATTRIBUTES : OUTFIELD_ATTRIBUTES).map(([key]) => values[key]).filter((value): value is number => value != null && Number.isFinite(value));
  return entered.length ? Math.min(99,Math.max(1,Math.round(entered.reduce((total,value)=>total+value,0)/entered.length))) : null;
}
