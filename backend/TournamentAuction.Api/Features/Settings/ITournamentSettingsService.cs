namespace TournamentAuction.Api.Features.Settings;

public interface ITournamentSettingsService
{
    Task<TournamentSettingsDto> GetSettingsAsync(Guid tournamentId, Guid userId);
    Task<TournamentSettingsDto> UpdateSettingsAsync(Guid tournamentId, UpdateTournamentSettingsRequest request, Guid userId);
}
