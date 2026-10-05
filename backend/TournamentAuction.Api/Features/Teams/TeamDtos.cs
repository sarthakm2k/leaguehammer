using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Teams;

public record CreateTeamRequest(
    [Required, MinLength(2), MaxLength(150)] string Name,
    [Required, MinLength(2), MaxLength(10)] string ShortName,
    string? LogoUrl,
    string? PrimaryColor,
    string? SecondaryColor,
    string? OwnerName,
    long? InitialPurse
);

public record UpdateTeamRequest(
    [Required, MinLength(2), MaxLength(150)] string Name,
    [Required, MinLength(2), MaxLength(10)] string ShortName,
    string? LogoUrl,
    string? PrimaryColor,
    string? SecondaryColor,
    string? OwnerName,
    long? InitialPurse
);

public record TeamDto(
    Guid Id,
    Guid TournamentId,
    string Name,
    string ShortName,
    string? LogoUrl,
    string PrimaryColor,
    string? SecondaryColor,
    string? OwnerName,
    long InitialPurse,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc
);
