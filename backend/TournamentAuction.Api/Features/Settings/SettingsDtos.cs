using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Settings;

public record TournamentSettingsDto(
    Guid Id,
    Guid TournamentId,
    string CurrencyCode,
    string CurrencySymbol,
    long DefaultStartingPurse,
    int MinimumSquadSize,
    int MaximumSquadSize,
    long MinimumAcquisitionPrice,
    long DefaultBidIncrement,
    bool PublicLiveViewEnabled,
    DateTime CreatedAtUtc,
    DateTime? UpdatedAtUtc,
    bool SellAllPlayers = false
);

public record UpdateTournamentSettingsRequest(
    [Required, MaxLength(10)] string CurrencyCode,
    [Required, MaxLength(10)] string CurrencySymbol,
    [Range(1000, 10000000000)] long DefaultStartingPurse,
    [Range(1, 100)] int MinimumSquadSize,
    [Range(1, 100)] int MaximumSquadSize,
    [Range(10, 100000000)] long MinimumAcquisitionPrice,
    [Range(10, 100000000)] long DefaultBidIncrement,
    bool PublicLiveViewEnabled,
    bool SellAllPlayers = false
);
