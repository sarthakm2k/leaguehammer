using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Domain;

public class AuctionEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AuctionSessionId { get; set; }
    public AuctionSession AuctionSession { get; set; } = null!;

    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;

    public Guid? AuctionLotId { get; set; }
    public AuctionLot? AuctionLot { get; set; }

    [Required]
    [MaxLength(50)]
    public string EventType { get; set; } = string.Empty;

    public Guid UserId { get; set; }
    public User User { get; set; } = null!;

    [Required]
    public string EventData { get; set; } = "{}"; // JSON payload

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
