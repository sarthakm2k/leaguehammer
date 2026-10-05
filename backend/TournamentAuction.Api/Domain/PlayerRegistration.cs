namespace TournamentAuction.Api.Domain;

public class RegistrationForm
{
    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;
    public bool Enabled { get; set; }
    public DateTime? OpensAtUtc { get; set; }
    public DateTime? ClosesAtUtc { get; set; }
    public bool ClosedManually { get; set; }
    public DateTime? FinalizedAtUtc { get; set; }
    public string? Instructions { get; set; }
}

public class PlayerRegistration
{
    // Client-generated random ID also makes a repeated submission idempotent.
    public Guid Id { get; set; }
    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public int? Age { get; set; }
    public string Position { get; set; } = "";
    public string? PreferredFoot { get; set; }
    public int? JerseyNumber { get; set; }
    public string? PreviousTeam { get; set; }
    public string? ShortBio { get; set; }
    public string? PhotoPath { get; set; }
    public string Status { get; set; } = "PENDING";
    public string? ReviewReason { get; set; }
    public Guid? PlayerId { get; set; }
    public DateTime SubmittedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAtUtc { get; set; }
    public Guid? ReviewedByUserId { get; set; }
}
