using System.ComponentModel.DataAnnotations;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Players;

public record PlayerRatingsRequest(
    [Range(1, 99)] int? Pace = null,
    [Range(1, 99)] int? Shooting = null,
    [Range(1, 99)] int? Passing = null,
    [Range(1, 99)] int? Dribbling = null,
    [Range(1, 99)] int? Defending = null,
    [Range(1, 99)] int? Physical = null,
    [Range(1, 99)] int? Diving = null,
    [Range(1, 99)] int? Handling = null,
    [Range(1, 99)] int? Kicking = null,
    [Range(1, 99)] int? Reflexes = null,
    [Range(1, 99)] int? Speed = null,
    [Range(1, 99)] int? Positioning = null);
public record PlayerRatingsDto(PlayerRatingsRequest Attributes, int? Overall, bool IsGoalkeeper);

public static class CardRatings
{
    public const string PositionPattern = "^(GK|CB|LB|RB|LWB|RWB|CDM|CM|CAM|LM|RM|LW|RW|CF|ST)$";
    public static string? Position(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var position = value.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(position, PositionPattern))
            throw new ArgumentException("Choose a valid card position.");
        return position;
    }
    public static bool Goalkeeper(string? cardPosition, string? position) =>
        cardPosition != null ? cardPosition == "GK" : string.Equals(position, "Goalkeeper", StringComparison.OrdinalIgnoreCase);
    public static string RatingProfile(string? cardPosition, string? position) =>
        Position(cardPosition) ?? position?.Trim().ToLowerInvariant() switch
        {
            "goalkeeper" => "GK", "defender" => "CB", "midfielder" => "CM", "forward" => "ST", _ => "BALANCED"
        };

    // LeagueHammer weights, ordered PAC/SHO/PAS/DRI/DEF/PHY (GK: DIV/HAN/KIC/REF/SPD/POS).
    public static int[] Weights(string profile) => profile switch
    {
        "ST" => [20, 35, 10, 20, 5, 10],
        "CF" => [15, 30, 20, 25, 5, 5],
        "LW" or "RW" => [30, 20, 15, 25, 5, 5],
        "LM" or "RM" => [25, 10, 25, 25, 5, 10],
        "CAM" => [10, 20, 30, 30, 5, 5],
        "CM" => [10, 10, 35, 20, 15, 10],
        "CDM" => [10, 5, 25, 10, 30, 20],
        "CB" => [10, 5, 10, 5, 45, 25],
        "LB" or "RB" => [20, 5, 20, 10, 30, 15],
        "LWB" or "RWB" => [25, 5, 25, 15, 20, 10],
        "GK" => [25, 20, 5, 30, 5, 15],
        _ => [1, 1, 1, 1, 1, 1]
    };

    public static int? Overall(PlayerRatingsRequest values, string? cardPosition, string? position = null)
    {
        var profile = RatingProfile(cardPosition, position);
        var weights = Weights(profile);
        int?[] ratings = profile == "GK" ? [values.Diving, values.Handling, values.Kicking, values.Reflexes, values.Speed, values.Positioning]
            : [values.Pace, values.Shooting, values.Passing, values.Dribbling, values.Defending, values.Physical];
        var total = 0;
        var enteredWeight = 0;
        for (var i = 0; i < ratings.Length; i++)
        {
            if (ratings[i] is not int value) continue;
            total += value * weights[i];
            enteredWeight += weights[i];
        }
        return enteredWeight == 0 ? null : Math.Clamp((int)Math.Round((double)total / enteredWeight, MidpointRounding.AwayFromZero), 1, 99);
    }
    public static PlayerRatingsDto FromPlayer(Player player)
    {
        var values = new PlayerRatingsRequest(player.Pace, player.Shooting, player.Passing, player.Dribbling, player.Defending, player.Physical, player.Diving, player.Handling, player.Kicking, player.Reflexes, player.Speed, player.Positioning);
        var goalkeeper = Goalkeeper(player.CardPosition, player.Position);
        return new(values, Overall(values, player.CardPosition, player.Position), goalkeeper);
    }
    public static void Apply(Player player, string? cardPosition, PlayerRatingsRequest? ratings)
    {
        var normalizedPosition = Position(cardPosition);
        ratings ??= new();
        int?[] entered = [ratings.Pace, ratings.Shooting, ratings.Passing, ratings.Dribbling, ratings.Defending, ratings.Physical,
            ratings.Diving, ratings.Handling, ratings.Kicking, ratings.Reflexes, ratings.Speed, ratings.Positioning];
        if (entered.Any(value => value is < 1 or > 99)) throw new ArgumentException("Player ratings must be whole numbers from 1 to 99.");
        player.CardPosition = normalizedPosition;
        player.Pace = ratings.Pace;
        player.Shooting = ratings.Shooting;
        player.Passing = ratings.Passing;
        player.Dribbling = ratings.Dribbling;
        player.Defending = ratings.Defending;
        player.Physical = ratings.Physical;
        player.Diving = ratings.Diving;
        player.Handling = ratings.Handling;
        player.Kicking = ratings.Kicking;
        player.Reflexes = ratings.Reflexes;
        player.Speed = ratings.Speed;
        player.Positioning = ratings.Positioning;
    }
}
