namespace TournamentAuction.Api.Domain;

public class Tournament
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string Season { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? LogoUrl { get; set; }
    public DateTime? TournamentDate { get; set; }
    public string? Location { get; set; }
    public string TimeZone { get; set; } = "Asia/Kolkata";
    public TournamentStatus Status { get; set; } = TournamentStatus.DRAFT;
    public Guid OwnerUserId { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAtUtc { get; set; }

    // Navigation properties
    public User Owner { get; set; } = null!;
    public TournamentSettings? Settings { get; set; }
    public ICollection<TournamentMember> Members { get; set; } = new List<TournamentMember>();
    public ICollection<Team> Teams { get; set; } = new List<Team>();
    public ICollection<BasePriceTier> BasePriceTiers { get; set; } = new List<BasePriceTier>();
    public ICollection<PlayerSet> PlayerSets { get; set; } = new List<PlayerSet>();
    public ICollection<Player> Players { get; set; } = new List<Player>();
    public ICollection<AuctionSession> AuctionSessions { get; set; } = new List<AuctionSession>();
}
