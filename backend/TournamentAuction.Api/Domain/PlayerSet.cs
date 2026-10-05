using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Domain;

public class PlayerSet
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid TournamentId { get; set; }
    public Tournament Tournament { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(500)]
    public string? Description { get; set; }

    public int SortOrder { get; set; } = 1;

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public ICollection<Player> Players { get; set; } = new List<Player>();
}
