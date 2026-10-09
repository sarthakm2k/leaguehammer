using System.ComponentModel.DataAnnotations;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Tournaments;

public record CreateTournamentRequest(
    [Required, MinLength(3), MaxLength(200)] string Name,
    [Required, MaxLength(50)] string Season,
    string? Slug,
    string? Description,
    string? LogoUrl,
    DateTime? TournamentDate,
    string? Location,
    string? TimeZone
);

public record UpdateTournamentRequest(
    [Required, MinLength(3), MaxLength(200)] string Name,
    [Required, MaxLength(50)] string Season,
    string? Description,
    string? LogoUrl,
    DateTime? TournamentDate,
    string? Location,
    string? TimeZone
);

public record CloneTournamentRequest(
    [Required, MinLength(3), MaxLength(200)] string Name
);

public record TournamentResponse(
    Guid Id,
    string Name,
    string Slug,
    string Season,
    string? Description,
    string? LogoUrl,
    DateTime? TournamentDate,
    string? Location,
    string TimeZone,
    TournamentStatus Status,
    Guid OwnerUserId,
    string UserRole,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc
);

public record TournamentSummaryDto(
    Guid Id,
    string Name,
    string Slug,
    string Season,
    TournamentStatus Status,
    string UserRole,
    DateTime CreatedAtUtc
);
