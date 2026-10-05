using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Players;

public record CreatePlayerRequest(
    [Required, MinLength(2), MaxLength(150)] string Name,
    [Required] Guid PlayerSetId,
    [Range(10, 1000000000)] long BasePrice,
    string? PhotoUrl,
    [Range(10, 70)] int? Age,
    string? Position,
    string? PreferredFoot,
    [Range(1, 99)] int? JerseyNumber,
    string? PreviousTeam,
    string? ShortBio
);

public record UpdatePlayerRequest(
    [Required, MinLength(2), MaxLength(150)] string Name,
    [Required] Guid PlayerSetId,
    [Range(10, 1000000000)] long BasePrice,
    string? PhotoUrl,
    [Range(10, 70)] int? Age,
    string? Position,
    string? PreferredFoot,
    [Range(1, 99)] int? JerseyNumber,
    string? PreviousTeam,
    string? ShortBio
);

public record PlayerDto(
    Guid Id,
    Guid TournamentId,
    Guid PlayerSetId,
    string PlayerSetName,
    string Name,
    string? PhotoUrl,
    int? Age,
    string? Position,
    string? PreferredFoot,
    long BasePrice,
    int? JerseyNumber,
    string? PreviousTeam,
    string? ShortBio,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc
);

public record PlayerFilterRequest(
    string? Search = null,
    Guid? PlayerSetId = null,
    string? Position = null,
    int Page = 1,
    int PageSize = 50
);

public record PagedPlayersDto(
    List<PlayerDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    int TotalPages
);

public record CsvPlayerRowDto(
    int RowNumber,
    string Name,
    string SetName,
    long BasePrice,
    string? Position,
    int? Age,
    string? PreferredFoot,
    string? PreviousTeam,
    int? JerseyNumber,
    bool IsValid,
    List<string> ValidationErrors,
    Guid? ResolvedPlayerSetId
);

public record CsvPreviewResponse(
    int TotalRows,
    int ValidRowsCount,
    int InvalidRowsCount,
    List<CsvPlayerRowDto> Rows
);

public record CsvImportCommitRequest(
    [Required] List<CsvPlayerRowDto> Players
);

public record CsvImportResult(
    int ImportedCount,
    int SkippedCount,
    List<string> Messages
);
