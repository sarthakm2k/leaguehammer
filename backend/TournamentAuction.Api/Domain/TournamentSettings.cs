namespace TournamentAuction.Api.Domain;

public class TournamentSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TournamentId { get; set; }

    public string CurrencyCode { get; set; } = "INR";
    public string CurrencySymbol { get; set; } = "₹";

    /// <summary>
    /// Stored as integer long (BIGINT) per Section 9 (e.g. 100000 for ₹1,00,000)
    /// </summary>
    public long DefaultStartingPurse { get; set; } = 100000;

    public int MinimumSquadSize { get; set; } = 12;
    public int MaximumSquadSize { get; set; } = 16;

    /// <summary>
    /// Minimum acquisition price per player (e.g. 500 for ₹500)
    /// </summary>
    public long MinimumAcquisitionPrice { get; set; } = 500;

    /// <summary>
    /// Default bid increment (e.g. 100 for ₹100)
    /// </summary>
    public long DefaultBidIncrement { get; set; } = 100;

    public bool PublicLiveViewEnabled { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    // Navigation
    public Tournament Tournament { get; set; } = null!;
}
