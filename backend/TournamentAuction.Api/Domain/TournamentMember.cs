namespace TournamentAuction.Api.Domain;

public class TournamentMember
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TournamentId { get; set; }
    public Guid UserId { get; set; }
    public TournamentRole Role { get; set; } = TournamentRole.VIEWER;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public Tournament Tournament { get; set; } = null!;
    public User User { get; set; } = null!;
}
