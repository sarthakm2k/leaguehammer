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
    DateTime? UpdatedAtUtc,
    List<TeamAssignedPlayerDto>? AssignedPlayers = null
);

public record TeamAssignedPlayerDto(Guid PlayerId, string PlayerName, string? PhotoUrl, string? Position,
    int? Age, string? PreferredFoot, int? JerseyNumber, string Role)
{
    public static TeamAssignedPlayerDto From(TournamentAuction.Api.Domain.Player p) =>
        new(p.Id, p.Name, p.PhotoUrl, p.Position, p.Age, p.PreferredFoot, p.JerseyNumber, p.AssignedRole!);
}
public record TeamAssignmentsRequest(Guid? CaptainPlayerId, Guid? IconPlayerId);
public record TeamAssignmentCandidateDto(Guid PlayerId, string PlayerName, string? PhotoUrl, string? Position);
public record TeamAssignmentsDto(List<TeamAssignedPlayerDto> AssignedPlayers, List<TeamAssignmentCandidateDto> AvailablePlayers);
