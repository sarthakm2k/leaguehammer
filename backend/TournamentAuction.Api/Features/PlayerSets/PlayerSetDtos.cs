using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.PlayerSets;

public record CreatePlayerSetRequest(
    [Required, MinLength(2), MaxLength(100)] string Name,
    [MaxLength(500)] string? Description,
    int? SortOrder
);

public record UpdatePlayerSetRequest(
    [Required, MinLength(2), MaxLength(100)] string Name,
    [MaxLength(500)] string? Description,
    int SortOrder
);

public record ReorderPlayerSetsRequest(
    [Required] List<Guid> OrderedSetIds
);

public record PlayerSetDto(
    Guid Id,
    Guid TournamentId,
    string Name,
    string? Description,
    int SortOrder,
    int PlayerCount,
    DateTime CreatedAtUtc
);
