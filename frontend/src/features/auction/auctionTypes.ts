export interface TeamAuctionStandingDto {
  teamId: string;
  teamName: string;
  shortName: string;
  primaryColor: string;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  initialPurse: number;
  totalSpent: number;
  remainingPurse: number;
  currentSquadSize: number;
  minimumSquadSize: number;
  maximumSquadSize: number;
  remainingSlotsToMinSquad: number;
  maxSlotsAvailable: number;
  requiredReserveForMinSquad: number;
  maximumAllowedBid: number;
  canBid: boolean;
}

export interface AuctionLotDto {
  lotId: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  photoUrl?: string | null;
  position?: string | null;
  age?: number | null;
  preferredFoot?: string | null;
  jerseyNumber?: number | null;
  previousTeam?: string | null;
  shortBio?: string | null;
  playerSetId: string;
  playerSetName: string;
  attemptNumber: number;
  drawPosition: number;
  status: 'PENDING' | 'ON_AUCTION' | 'SOLD' | 'UNSOLD' | 'CANCELLED';
  winningTeamId?: string | null;
  winningTeamName?: string | null;
  finalPrice?: number | null;
  basePrice: number;
  revealedAtUtc?: string | null;
  completedAtUtc?: string | null;
}

export interface SetSummaryDto {
  setId: string;
  setName: string;
  totalPlayersInSet: number;
  soldCount: number;
  unsoldCount: number;
  remainingCount: number;
  totalSpentInSet: number;
  highestPlayerName?: string | null;
  highestPrice?: number | null;
  highestTeamName?: string | null;
}

export interface AuctionStateDto {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  sessionId: string;
  sessionStatus: 'READY' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  version: number;
  isUnsoldRound: boolean;
  currentSetId?: string | null;
  currentSetName?: string | null;
  currentLot?: AuctionLotDto | null;
  totalSetsCount: number;
  completedSetsCount: number;
  totalPlayersCount: number;
  totalSoldPlayersCount: number;
  totalUnsoldPlayersCount: number;
  totalPendingPlayersCount: number;
  totalPurseAcrossTeams: number;
  totalSpentAcrossTournament: number;
  teamStandings: TeamAuctionStandingDto[];
  currentSetSummary?: SetSummaryDto | null;
  startedAtUtc?: string | null;
  pausedAtUtc?: string | null;
  completedAtUtc?: string | null;
}

export interface AuctionEventDto {
  id: string;
  sessionId: string;
  tournamentId: string;
  auctionLotId?: string | null;
  eventType: string;
  userId: string;
  userName: string;
  eventData: string;
  createdAtUtc: string;
}

export interface PlayerSetSummary {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  playerCount: number;
}
