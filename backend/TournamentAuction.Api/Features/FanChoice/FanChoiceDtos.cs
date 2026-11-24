namespace TournamentAuction.Api.Features.FanChoice;

public static class FanChoiceCategories
{
    public static readonly (string Key, string Title, string Description)[] All =
    [
        ("BEST_BUY", "Best Auction Buy", "Which signing was the best value for its auction price?"),
        ("STRONGEST_SQUAD", "Strongest Squad", "Which complete squad looks strongest, including captains and icons?"),
        ("FAVOURITE_PLAYER", "Fan Favourite Player", "Choose your favourite tournament player, including captains, icons and unsold players."),
        ("BEST_CAPTAIN", "Best Captain Pick", "Which team made the strongest captain selection?"),
        ("BEST_ICON", "Best Icon Pick", "Choose your favourite assigned icon player.")
    ];
}

public record FanSquadMemberDto(string Name, string? PhotoUrl, string? Position, string? Role);
public record FanChoiceOptionDto(Guid Id, string Name, string? PhotoUrl, string Subtitle, long? Price,
    List<FanSquadMemberDto>? Squad, int? Votes, decimal? Percentage);
public record FanChoicePollDto(Guid Id, string Category, string Title, string Description, bool IsOpen,
    Guid? SelectedOptionId, int? TotalVotes, List<FanChoiceOptionDto> Options);
public record FanChoicePageDto(Guid TournamentId, string TournamentName, string Slug, string? LogoUrl,
    string CurrencyCode, List<FanChoicePollDto> Polls);
public record FanChoiceAdminPollDto(string Category, string Title, bool Enabled, bool IsOpen, int OptionCount, int VoteCount);
public record FanChoiceAdminDto(bool AuctionCompleted, bool PublicLiveViewEnabled, List<FanChoiceAdminPollDto> Polls);
public record FanChoiceSettingsRequest(bool Enabled, bool IsOpen);
public record FanChoiceVoteRequest(Guid OptionId);
