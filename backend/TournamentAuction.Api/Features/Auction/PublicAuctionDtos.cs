namespace TournamentAuction.Api.Features.Auction;

// Deliberately independent of AuctionLotDto: public clients never receive draw positions or audit data.
public record PublicAuctionLotDto(
    Guid LotId, Guid PlayerId, string PlayerName, string? PhotoUrl, string? Position,
    int? Age, string? PreferredFoot, int? JerseyNumber, string PlayerSetName, int AttemptNumber,
    string Status, Guid? WinningTeamId, string? WinningTeamName, long? FinalPrice, long BasePrice,
    long? CurrentBid, Guid? LeadingTeamId);

public record PublicAuctionStateDto(
    Guid TournamentId, string TournamentName, string Slug, string CurrencyCode, string CurrencySymbol,
    string SessionStatus, long Version, bool IsUnsoldRound, string? CurrentSetName,
    PublicAuctionLotDto? CurrentLot, PublicAuctionLotDto? LastResult,
    int TotalPlayersCount, int TotalSoldPlayersCount, int TotalUnsoldPlayersCount,
    List<TeamAuctionStandingDto> TeamStandings, List<PublicAuctionLotDto> SoldPlayers,
    SetSummaryDto? CurrentSetSummary);
