namespace TournamentAuction.Api.Features.Teams;

public interface ITeamService
{
    Task<List<TeamDto>> GetTeamsAsync(Guid tournamentId, Guid userId);
    Task<TeamDto?> GetTeamByIdAsync(Guid tournamentId, Guid teamId, Guid userId);
    Task<TeamDto> CreateTeamAsync(Guid tournamentId, CreateTeamRequest request, Guid userId);
    Task<TeamDto> UpdateTeamAsync(Guid tournamentId, Guid teamId, UpdateTeamRequest request, Guid userId);
    Task DeleteTeamAsync(Guid tournamentId, Guid teamId, Guid userId);
}
