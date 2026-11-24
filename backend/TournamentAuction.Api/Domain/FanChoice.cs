namespace TournamentAuction.Api.Domain;

public class FanChoicePoll
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TournamentId { get; set; }
    public string Category { get; set; } = "";
    public bool Enabled { get; set; }
    public bool IsOpen { get; set; }
}

public class FanChoiceOption
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PollId { get; set; }
    public Guid CandidateId { get; set; }
    public string Name { get; set; } = "";
    public string? PhotoUrl { get; set; }
    public string Subtitle { get; set; } = "";
    public long? Price { get; set; }
    public string? RosterJson { get; set; }
}

public class FanChoiceVote
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PollId { get; set; }
    public Guid OptionId { get; set; }
    public string VoterHash { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
