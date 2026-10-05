import type { PublicAuctionStateDto, TeamAuctionStandingDto } from './auctionTypes';

export interface ResultPlayer {
  playerId: string; playerName: string; photoUrl: string | null; position: string | null;
  age: number | null; preferredFoot: string | null; jerseyNumber: number | null;
  playerSetId: string; playerSetName: string; basePrice: number; status: string; attemptCount: number;
  winningTeamId: string | null; winningTeamName: string | null; finalPrice: number | null;
  pricePremium: number | null; priceMultiplier: number | null;
}
export interface PositionStatistics { position: string; playerCount: number; totalSpent: number }
export interface TeamStatistics {
  standing: TeamAuctionStandingDto; averagePlayerCost: number; mostExpensiveSigning: ResultPlayer | null;
  positions: PositionStatistics[];
}
export interface SetStatistics {
  setId: string; setName: string; sortOrder: number; playerCount: number; soldCount: number; unsoldCount: number;
  totalSpent: number; averageSalePrice: number; highestSalePrice: number; sellThroughPercentage: number;
}
export interface TournamentStatistics {
  totalPlayers: number; soldPlayers: number; unsoldPlayers: number; availablePlayers: number;
  salePercentage: number; totalSpent: number; averageSalePrice: number; medianSalePrice: number; highestSalePrice: number;
  topPlayers: ResultPlayer[]; biggestPricePremium: ResultPlayer | null; highestPriceMultiplier: ResultPlayer | null;
  mostExpensiveByPosition: ResultPlayer[]; mostExpensiveBySet: ResultPlayer[];
  teams: TeamStatistics[]; sets: SetStatistics[]; positions: PositionStatistics[];
  biggestSpenderTeamId: string | null; smallestSpenderTeamId: string | null;
  largestRemainingPurseTeamId: string | null; mostPlayersTeamId: string | null; bestSellingSetId: string | null;
}
export interface AuctionResults {
  state: PublicAuctionStateDto; tournamentLogoUrl: string | null; publicLiveViewEnabled: boolean;
  players: ResultPlayer[]; statistics: TournamentStatistics;
}
