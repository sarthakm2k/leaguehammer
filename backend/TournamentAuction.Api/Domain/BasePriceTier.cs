namespace TournamentAuction.Api.Domain;

public class BasePriceTier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TournamentId { get; set; }

    public string Label { get; set; } = string.Empty;
    public long Amount { get; set; }
    public int SortOrder { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation
    public Tournament Tournament { get; set; } = null!;
}
