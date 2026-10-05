using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Registrations;

public record RegistrationSettingsRequest(bool Enabled, DateTime? OpensAtUtc, DateTime? ClosesAtUtc,
    bool ClosedManually, [MaxLength(2000)] string? Instructions);

public class RegistrationSubmissionRequest
{
    public Guid SubmissionId { get; set; }
    [Required, MinLength(2), MaxLength(150)] public string Name { get; set; } = "";
    [Required, MaxLength(30)] public string Phone { get; set; } = "";
    [EmailAddress, MaxLength(256)] public string? Email { get; set; }
    [Range(10, 70)] public int? Age { get; set; }
    [Required, MaxLength(50)] public string Position { get; set; } = "";
    [MaxLength(20)] public string? PreferredFoot { get; set; }
    [Range(1, 99)] public int? JerseyNumber { get; set; }
    [MaxLength(150)] public string? PreviousTeam { get; set; }
    [MaxLength(1000)] public string? ShortBio { get; set; }
    public bool Consent { get; set; }
    public string? Website { get; set; } // Honeypot: real users leave this empty.
    public IFormFile? Photo { get; set; }
}

public record RegistrationReviewRequest(bool Approve,
    [Required, MinLength(2), MaxLength(150)] string Name,
    [Required, MaxLength(30)] string Phone,
    [EmailAddress, MaxLength(256)] string? Email,
    [Range(10, 70)] int? Age,
    [Required, MaxLength(50)] string Position,
    [MaxLength(20)] string? PreferredFoot,
    [Range(1, 99)] int? JerseyNumber,
    [MaxLength(150)] string? PreviousTeam,
    [MaxLength(1000)] string? ShortBio,
    Guid? PlayerSetId, [Range(10, 1000000000)] long? BasePrice,
    [MaxLength(1000)] string? Reason, bool DuplicateConfirmed = false);

public record RegistrationFormDto(Guid TournamentId, string TournamentName, string Slug, string TimeZone,
    bool Enabled, DateTime? OpensAtUtc, DateTime? ClosesAtUtc, bool ClosedManually,
    DateTime? FinalizedAtUtc, string? Instructions, string Status, DateTime ServerTimeUtc, bool PhotoUploadAvailable);
public record RegistrationReceipt(Guid SubmissionId, string Reference, DateTime SubmittedAtUtc);
public record RegistrationEntryDto(Guid Id, string Name, string Phone, string? Email, int? Age,
    string Position, string? PreferredFoot, int? JerseyNumber, string? PreviousTeam, string? ShortBio,
    string? PhotoUrl, string Status, string? ReviewReason, Guid? PlayerId, DateTime SubmittedAtUtc,
    DateTime? ReviewedAtUtc, bool PossibleDuplicate, bool HasPhoto);
