using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.BasePriceTiers;

public record CreateBasePriceTierRequest(
    [Required, MaxLength(50)] string Label,
    [Range(10, 100000000)] long Amount,
    int SortOrder
);

public record BasePriceTierDto(
    Guid Id,
    Guid TournamentId,
    string Label,
    long Amount,
    int SortOrder
);
