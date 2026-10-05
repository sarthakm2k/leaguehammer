namespace TournamentAuction.Api.Features.PlayerSets;

public interface IPlayerSetService
{
    Task<List<PlayerSetDto>> GetSetsAsync(Guid tournamentId, Guid userId);
    Task<PlayerSetDto> GetSetByIdAsync(Guid tournamentId, Guid setId, Guid userId);
    Task<PlayerSetDto> CreateSetAsync(Guid tournamentId, CreatePlayerSetRequest request, Guid userId);
    Task<PlayerSetDto> UpdateSetAsync(Guid tournamentId, Guid setId, UpdatePlayerSetRequest request, Guid userId);
    Task DeleteSetAsync(Guid tournamentId, Guid setId, Guid userId);
    Task ReorderSetsAsync(Guid tournamentId, ReorderPlayerSetsRequest request, Guid userId);
}
