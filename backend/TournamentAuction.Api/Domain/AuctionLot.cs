using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Domain;

public class AuctionLot
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid AuctionSessionId { get; set; }
    public AuctionSession AuctionSession { get; set; } = null!;

    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;

    public Guid PlayerId { get; set; }
    public Player Player { get; set; } = null!;

    public Guid PlayerSetId { get; set; }
    public PlayerSet PlayerSet { get; set; } = null!;

    public int AttemptNumber { get; set; } = 1;

    public int DrawPosition { get; set; }

    public AuctionLotStatus Status { get; set; } = AuctionLotStatus.PENDING;

    public Guid? WinningTeamId { get; set; }
    public Team? WinningTeam { get; set; }

    public long? FinalPrice { get; set; }

    public DateTime? RevealedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }
}
