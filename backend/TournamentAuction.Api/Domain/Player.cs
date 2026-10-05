using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Domain;

public class Player
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;

    public Guid PlayerSetId { get; set; }
    public PlayerSet PlayerSet { get; set; } = null!;

    [Required]
    [MaxLength(150)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? PhotoUrl { get; set; }

    public int? Age { get; set; }

    [MaxLength(50)]
    public string? Position { get; set; } // Goalkeeper, Defender, Midfielder, Forward

    [MaxLength(20)]
    public string? PreferredFoot { get; set; } // Right, Left, Both

    public long BasePrice { get; set; }

    public int? JerseyNumber { get; set; }

    [MaxLength(150)]
    public string? PreviousTeam { get; set; }

    [MaxLength(1000)]
    public string? ShortBio { get; set; }

    [Required]
    [MaxLength(30)]
    public string Status { get; set; } = "AVAILABLE"; // AVAILABLE, ON_AUCTION, SOLD, UNSOLD, FINAL_UNSOLD

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAtUtc { get; set; }
}
