namespace TournamentAuction.Api.Features.Preflight;

public interface ITournamentPreflightService
{
    Task<PreflightReportDto> RunPreflightAsync(Guid tournamentId, Guid userId);
    Task<PreflightReportDto> ApproveReadyForAuctionAsync(Guid tournamentId, Guid userId);
    Task<PreflightReportDto> ReturnToDraftAsync(Guid tournamentId, Guid userId);
}
