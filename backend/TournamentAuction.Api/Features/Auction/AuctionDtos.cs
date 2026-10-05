using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Auction;

public record TeamAuctionStandingDto(
    Guid TeamId,
    string TeamName,
    string ShortName,
    string PrimaryColor,
    string? SecondaryColor,
    string? LogoUrl,
    long InitialPurse,
    long TotalSpent,
    long RemainingPurse,
    int CurrentSquadSize,
    int MinimumSquadSize,
    int MaximumSquadSize,
    int RemainingSlotsToMinSquad,
    int MaxSlotsAvailable,
    long RequiredReserveForMinSquad,
    long MaximumAllowedBid,
    bool CanBid
);

public record AuctionLotDto(
    Guid LotId,
    Guid SessionId,
    Guid PlayerId,
    string PlayerName,
    string? PhotoUrl,
    string? Position,
    int? Age,
    string? PreferredFoot,
    int? JerseyNumber,
    string? PreviousTeam,
    string? ShortBio,
    Guid PlayerSetId,
    string PlayerSetName,
    int AttemptNumber,
    int DrawPosition,
    string Status,
    Guid? WinningTeamId,
    string? WinningTeamName,
    long? FinalPrice,
    long BasePrice,
    DateTime? RevealedAtUtc,
    DateTime? CompletedAtUtc
);

public record SetSummaryDto(
    Guid SetId,
    string SetName,
    int TotalPlayersInSet,
    int SoldCount,
    int UnsoldCount,
    int RemainingCount,
    long TotalSpentInSet,
    string? HighestPlayerName,
    long? HighestPrice,
    string? HighestTeamName
);

public record AuctionStateDto(
    Guid TournamentId,
    string TournamentName,
    string TournamentStatus,
    Guid SessionId,
    string SessionStatus,
    long Version,
    bool IsUnsoldRound,
    Guid? CurrentSetId,
    string? CurrentSetName,
    AuctionLotDto? CurrentLot,
    int TotalSetsCount,
    int CompletedSetsCount,
    int TotalPlayersCount,
    int TotalSoldPlayersCount,
    int TotalUnsoldPlayersCount,
    int TotalPendingPlayersCount,
    long TotalPurseAcrossTeams,
    long TotalSpentAcrossTournament,
    List<TeamAuctionStandingDto> TeamStandings,
    SetSummaryDto? CurrentSetSummary,
    DateTime? StartedAtUtc,
    DateTime? PausedAtUtc,
    DateTime? CompletedAtUtc
);

public record StartSetRequest(
    [Required] Guid SetId
);

public record SellPlayerRequest(
    [Required] Guid LotId,
    [Required] Guid WinningTeamId,
    [Range(1, 10000000000)] long FinalPrice
);

public record MarkUnsoldRequest(
    [Required] Guid LotId
);

public record CorrectResultRequest(
    [Required] Guid LotId,
    [Required] Guid NewWinningTeamId,
    [Range(1, 10000000000)] long NewFinalPrice,
    [Required, MaxLength(500)] string Reason
);

public record CompleteAuctionRequest(
    [MaxLength(500)] string? OverrideReason
);

public record AuctionEventDto(
    Guid Id,
    Guid SessionId,
    Guid TournamentId,
    Guid? AuctionLotId,
    string EventType,
    Guid UserId,
    string UserName,
    string EventData,
    DateTime CreatedAtUtc
);
