using TournamentAuction.Api.Features.Players;
namespace TournamentAuction.Api.Features.Auction;

// Public result contracts contain player outcomes, never persisted draw order or private audit data.
public record ResultPlayerDto(Guid PlayerId, string PlayerName, string? PhotoUrl, string? Position,
    int? Age, string? PreferredFoot, int? JerseyNumber, Guid PlayerSetId, string PlayerSetName,
    long BasePrice, string Status, int AttemptCount, Guid? WinningTeamId, string? WinningTeamName,
    long? FinalPrice, long? PricePremium, decimal? PriceMultiplier, string? CardPosition = null, PlayerRatingsDto? Ratings = null);

public record PositionStatisticsDto(string Position, int PlayerCount, long TotalSpent);
public record TeamStatisticsDto(TeamAuctionStandingDto Standing, decimal AveragePlayerCost,
    ResultPlayerDto? MostExpensiveSigning, List<PositionStatisticsDto> Positions);
public record SetStatisticsDto(Guid SetId, string SetName, int SortOrder, int PlayerCount, int SoldCount,
    int UnsoldCount, long TotalSpent, decimal AverageSalePrice, long HighestSalePrice, decimal SellThroughPercentage);
public record TournamentStatisticsDto(int TotalPlayers, int SoldPlayers, int UnsoldPlayers, int AvailablePlayers,
    decimal SalePercentage, long TotalSpent, decimal AverageSalePrice, decimal MedianSalePrice, long HighestSalePrice,
    List<ResultPlayerDto> TopPlayers, ResultPlayerDto? BiggestPricePremium, ResultPlayerDto? HighestPriceMultiplier,
    List<ResultPlayerDto> MostExpensiveByPosition, List<ResultPlayerDto> MostExpensiveBySet,
    List<TeamStatisticsDto> Teams, List<SetStatisticsDto> Sets, List<PositionStatisticsDto> Positions,
    Guid? BiggestSpenderTeamId, Guid? SmallestSpenderTeamId, Guid? LargestRemainingPurseTeamId,
    Guid? MostPlayersTeamId, Guid? BestSellingSetId);
public record AuctionResultsDto(PublicAuctionStateDto State, string? TournamentLogoUrl, bool PublicLiveViewEnabled,
    List<ResultPlayerDto> Players, TournamentStatisticsDto Statistics);
public record TeamSquadDto(Guid TournamentId, string TournamentName, string Slug, string SessionStatus,
    string CurrencyCode, string CurrencySymbol, TeamStatisticsDto Team, List<ResultPlayerDto> Players);
