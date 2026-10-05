using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Domain;

public class AuctionSession
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;

    public AuctionSessionStatus Status { get; set; } = AuctionSessionStatus.READY;

    public Guid? CurrentSetId { get; set; }
    public PlayerSet? CurrentSet { get; set; }

    public Guid? CurrentLotId { get; set; }
    public AuctionLot? CurrentLot { get; set; }

    public bool IsUnsoldRound { get; set; } = false;

    public long Version { get; set; } = 1;

    public DateTime? StartedAtUtc { get; set; }

    public DateTime? PausedAtUtc { get; set; }

    public DateTime? CompletedAtUtc { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }

    public ICollection<AuctionLot> Lots { get; set; } = new List<AuctionLot>();

    public ICollection<AuctionEvent> Events { get; set; } = new List<AuctionEvent>();
}
