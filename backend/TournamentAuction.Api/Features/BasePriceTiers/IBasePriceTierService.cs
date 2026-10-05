namespace TournamentAuction.Api.Features.BasePriceTiers;

public interface IBasePriceTierService
{
    Task<List<BasePriceTierDto>> GetTiersAsync(Guid tournamentId, Guid userId);
    Task<BasePriceTierDto> CreateTierAsync(Guid tournamentId, CreateBasePriceTierRequest request, Guid userId);
    Task DeleteTierAsync(Guid tournamentId, Guid tierId, Guid userId);
}
