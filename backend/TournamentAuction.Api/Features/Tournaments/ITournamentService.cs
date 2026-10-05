namespace TournamentAuction.Api.Features.Tournaments;

public interface ITournamentService
{
    Task<List<TournamentSummaryDto>> GetTournamentsForUserAsync(Guid userId);
    Task<TournamentResponse?> GetTournamentByIdAsync(Guid tournamentId, Guid userId);
    Task<TournamentResponse> CreateTournamentAsync(CreateTournamentRequest request, Guid userId);
    Task<TournamentResponse> UpdateTournamentAsync(Guid tournamentId, UpdateTournamentRequest request, Guid userId);
    Task DeleteTournamentAsync(Guid tournamentId, Guid userId);
}
