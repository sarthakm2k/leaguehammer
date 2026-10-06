using TournamentAuction.Api.Features.Players;
using System.Data;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Auction;

public partial class AuctionEngineService
{
    public async Task<AuctionResultsDto> GetAuctionResultsAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: false);
        return await BuildResultsAsync(tournament);
    }

    public async Task<AuctionResultsDto> GetPublicAuctionResultsAsync(string tournamentKey)
    {
        Guid.TryParse(tournamentKey, out var id);
        var tournament = await _db.Tournaments.Include(t => t.Settings)
            .FirstOrDefaultAsync(t => t.Id == id || t.Slug == tournamentKey);
        if (tournament?.Settings?.PublicLiveViewEnabled != true)
            throw new KeyNotFoundException("Public live view is unavailable for this tournament.");
        return await BuildResultsAsync(tournament);
    }

    private async Task<AuctionResultsDto> BuildResultsAsync(Tournament tournament)
    {
        // Read all components from one PostgreSQL snapshot if a sale/correction commits mid-request.
        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead) : null;
        var session = await _db.AuctionSessions.Include(s => s.CurrentSet).FirstOrDefaultAsync(s => s.TournamentId == tournament.Id);
        var state = session == null ? await BuildInitialAuctionStateAsync(tournament) : await BuildAuctionStateAsync(tournament, session);
        var players = await _db.Players.Include(p => p.PlayerSet).Where(p => p.TournamentId == tournament.Id)
            .OrderBy(p => p.Name).ThenBy(p => p.Id).ToListAsync();
        var lots = await _db.AuctionLots.Include(l => l.Player).Include(l => l.PlayerSet).Include(l => l.WinningTeam)
            .Where(l => l.TournamentId == tournament.Id).ToListAsync();
        var sets = await _db.PlayerSets.Where(s => s.TournamentId == tournament.Id).OrderBy(s => s.SortOrder).ThenBy(s => s.Id).ToListAsync();
        var results = players.Select(player =>
        {
            var attempts = lots.Where(l => l.PlayerId == player.Id).ToList();
            var sold = attempts.SingleOrDefault(l => l.Status == AuctionLotStatus.SOLD);
            return new ResultPlayerDto(player.Id, player.Name, player.PhotoUrl, player.Position, player.Age,
                player.PreferredFoot, player.JerseyNumber, player.PlayerSetId, player.PlayerSet.Name, player.BasePrice,
                player.Status, attempts.Count(l => l.RevealedAtUtc != null), sold?.WinningTeamId, sold?.WinningTeam?.Name,
                sold?.FinalPrice, sold?.FinalPrice - player.BasePrice,
                sold?.FinalPrice != null && player.BasePrice > 0 ? (decimal)sold.FinalPrice.Value / player.BasePrice : null, player.CardPosition, CardRatings.FromPlayer(player));
        }).ToList();
        var soldPlayers = results.Where(p => p.Status == "SOLD" && p.FinalPrice != null)
            .OrderByDescending(p => p.FinalPrice).ThenBy(p => p.PlayerName).ThenBy(p => p.PlayerId).ToList();
        var unsoldCount = results.Count(p => p.Status is "UNSOLD" or "FINAL_UNSOLD");
        var teamStats = state.TeamStandings.Select(standing =>
        {
            var roster = soldPlayers.Where(p => p.WinningTeamId == standing.TeamId).ToList();
            return new TeamStatisticsDto(standing, Average(roster), roster.FirstOrDefault(), PositionStats(roster));
        }).ToList();
        var setStats = sets.Select(set =>
        {
            var all = results.Where(p => p.PlayerSetId == set.Id).ToList();
            var sold = soldPlayers.Where(p => p.PlayerSetId == set.Id).ToList();
            return new SetStatisticsDto(set.Id, set.Name, set.SortOrder, all.Count, sold.Count,
                all.Count(p => p.Status is "UNSOLD" or "FINAL_UNSOLD"), sold.Sum(p => p.FinalPrice!.Value),
                Average(sold), sold.FirstOrDefault()?.FinalPrice ?? 0, Percentage(sold.Count, all.Count));
        }).ToList();
        var prices = soldPlayers.Select(p => p.FinalPrice!.Value).OrderBy(p => p).ToList();
        var median = prices.Count == 0 ? 0 : prices.Count % 2 == 1 ? prices[prices.Count / 2]
            : ((decimal)prices[prices.Count / 2 - 1] + prices[prices.Count / 2]) / 2;
        var statistics = new TournamentStatisticsDto(results.Count, soldPlayers.Count, unsoldCount,
            results.Count(p => p.Status is "AVAILABLE" or "ON_AUCTION"), Percentage(soldPlayers.Count, results.Count),
            soldPlayers.Sum(p => p.FinalPrice!.Value), Average(soldPlayers), median, soldPlayers.FirstOrDefault()?.FinalPrice ?? 0,
            soldPlayers.Take(10).ToList(), soldPlayers.OrderByDescending(p => p.PricePremium).FirstOrDefault(),
            soldPlayers.Where(p => p.PriceMultiplier != null).OrderByDescending(p => p.PriceMultiplier).FirstOrDefault(),
            soldPlayers.GroupBy(p => PositionName(p.Position), StringComparer.OrdinalIgnoreCase).Select(g => g.First()).ToList(),
            soldPlayers.GroupBy(p => p.PlayerSetId).Select(g => g.First()).ToList(), teamStats, setStats, PositionStats(soldPlayers),
            teamStats.OrderByDescending(t => t.Standing.TotalSpent).FirstOrDefault()?.Standing.TeamId,
            teamStats.OrderBy(t => t.Standing.TotalSpent).FirstOrDefault()?.Standing.TeamId,
            teamStats.OrderByDescending(t => t.Standing.RemainingPurse).FirstOrDefault()?.Standing.TeamId,
            teamStats.OrderByDescending(t => t.Standing.CurrentSquadSize).FirstOrDefault()?.Standing.TeamId,
            setStats.Where(s => s.PlayerCount > 0).OrderByDescending(s => s.SellThroughPercentage)
                .ThenByDescending(s => s.TotalSpent).ThenBy(s => s.SortOrder).FirstOrDefault()?.SetId);
        var publicState = new PublicAuctionStateDto(state.TournamentId, state.TournamentName, tournament.Slug,
            state.CurrencyCode, state.CurrencySymbol, state.SessionStatus, state.Version, state.IsUnsoldRound,
            state.CurrentSetName, ToPublic(state.CurrentLot), ToPublic(state.LastResult), results.Count,
            soldPlayers.Count, unsoldCount, state.TeamStandings,
            lots.Where(l => l.Status == AuctionLotStatus.SOLD).OrderByDescending(l => l.CompletedAtUtc).ThenBy(l => l.Id)
                .Select(l => ToPublic(MapLot(l))!).ToList(), state.CurrentSetSummary, state.SellAllPlayers, state.CurrentAttemptNumber);
        if (transaction != null) await transaction.CommitAsync();
        return new(publicState, tournament.LogoUrl, tournament.Settings?.PublicLiveViewEnabled == true, results, statistics);
    }

    private static decimal Average(List<ResultPlayerDto> sold) => sold.Count == 0 ? 0 : sold.Sum(p => (decimal)p.FinalPrice!.Value) / sold.Count;
    private static decimal Percentage(int count, int total) => total == 0 ? 0 : (decimal)count * 100 / total;
    private static string PositionName(string? position) => string.IsNullOrWhiteSpace(position) ? "Unspecified" : position.Trim();
    private static List<PositionStatisticsDto> PositionStats(List<ResultPlayerDto> sold) => sold
        .GroupBy(p => PositionName(p.Position), StringComparer.OrdinalIgnoreCase)
        .Select(g => new PositionStatisticsDto(g.Key, g.Count(), g.Sum(p => p.FinalPrice!.Value)))
        .OrderByDescending(p => p.TotalSpent).ThenBy(p => p.Position).ToList();
}
