namespace TournamentAuction.Api.Domain;

public class Team
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TournamentId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public string? LogoUrl { get; set; }
    public string PrimaryColor { get; set; } = "#10B981";
    public string? SecondaryColor { get; set; } = "#047857";
    public string? OwnerName { get; set; }

    /// <summary>
    /// Stored as integer long (BIGINT). Defaults to TournamentSettings.DefaultStartingPurse.
    /// Remaining purse is derived: InitialPurse - sum(confirmed purchases).
    /// </summary>
    public long InitialPurse { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    // Navigation
    public Tournament Tournament { get; set; } = null!;
}
