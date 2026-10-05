namespace TournamentAuction.Api.Features.Auction;

public interface IAuctionEngineService
{
    Task<AuctionStateDto> GetAuctionStateAsync(Guid tournamentId, Guid userId);
    Task<PublicAuctionStateDto> GetPublicAuctionStateAsync(string tournamentKey);
    Task<AuctionStateDto> UpdateBidAsync(Guid tournamentId, UpdateBidRequest request, Guid userId);
    Task<AuctionStateDto> StartAuctionAsync(Guid tournamentId, Guid userId);
    Task<AuctionStateDto> PauseAuctionAsync(Guid tournamentId, Guid userId);
    Task<AuctionStateDto> ResumeAuctionAsync(Guid tournamentId, Guid userId);
    Task<AuctionStateDto> StartSetAsync(Guid tournamentId, StartSetRequest request, Guid userId);
    Task<AuctionStateDto> RevealNextPlayerAsync(Guid tournamentId, Guid userId);
    Task<AuctionStateDto> SellCurrentPlayerAsync(Guid tournamentId, SellPlayerRequest request, Guid userId);
    Task<AuctionStateDto> MarkCurrentPlayerUnsoldAsync(Guid tournamentId, MarkUnsoldRequest request, Guid userId);
    Task<SetSummaryDto> CompleteSetAsync(Guid tournamentId, Guid setId, Guid userId);
    Task<AuctionStateDto> StartUnsoldRoundAsync(Guid tournamentId, Guid userId);
    Task<AuctionStateDto> CorrectAuctionResultAsync(Guid tournamentId, CorrectResultRequest request, Guid userId);
    Task<AuctionStateDto> CompleteAuctionAsync(Guid tournamentId, CompleteAuctionRequest? request, Guid userId);
    Task<List<AuctionEventDto>> GetAuctionEventsAsync(Guid tournamentId, Guid userId, int take = 50, int skip = 0);
    Task<AuctionHistoryDto> GetAuctionHistoryAsync(Guid tournamentId, Guid userId);
    Task<AuctionResultsDto> GetAuctionResultsAsync(Guid tournamentId, Guid userId);
    Task<AuctionResultsDto> GetPublicAuctionResultsAsync(string tournamentKey);
}
