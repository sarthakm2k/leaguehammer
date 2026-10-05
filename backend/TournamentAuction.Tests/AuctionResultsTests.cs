using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;
using Xunit;

namespace TournamentAuction.Tests;

public partial class AuctionWorkflowTests
{
    [Fact]
    public async Task ResultsAreDerivedAndCorrectionsUpdateAllRankingsAndFinances()
    {
        var (db, engine, tournament, first, second, set) = await Setup(3);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var one = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            (await db.Players.FindAsync(one.PlayerId))!.Position = "Forward";
            await db.SaveChangesAsync();
            await engine.SellCurrentPlayerAsync(tournament.Id, new(one.LotId, first.Id, 1000), owner);
            var two = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            (await db.Players.FindAsync(two.PlayerId))!.Position = "Defender";
            await db.SaveChangesAsync();
            await engine.SellCurrentPlayerAsync(tournament.Id, new(two.LotId, first.Id, 2000), owner);
            var initial = (await engine.GetAuctionResultsAsync(tournament.Id, owner)).Statistics;
            Assert.Equal(3000, initial.TotalSpent);
            Assert.Equal(1500, initial.AverageSalePrice);
            Assert.Equal(1500, initial.MedianSalePrice);
            await engine.CorrectAuctionResultAsync(tournament.Id, new(two.LotId, second.Id, 3000, "Correct bidder and price"), owner);
            var results = await engine.GetPublicAuctionResultsAsync(tournament.Slug);
            var stats = results.Statistics;
            Assert.Equal(3, stats.TotalPlayers);
            Assert.Equal(2, stats.SoldPlayers);
            Assert.Equal(1, stats.AvailablePlayers);
            Assert.Equal(4000, stats.TotalSpent);
            Assert.Equal(2000, stats.AverageSalePrice);
            Assert.Equal(2000, stats.MedianSalePrice);
            Assert.Equal(3000, stats.HighestSalePrice);
            Assert.Equal(two.PlayerId, stats.TopPlayers[0].PlayerId);
            Assert.Equal(2500, stats.BiggestPricePremium!.PricePremium);
            Assert.Equal(6, stats.HighestPriceMultiplier!.PriceMultiplier);
            Assert.Equal(second.Id, stats.BiggestSpenderTeamId);
            Assert.Equal(first.Id, stats.SmallestSpenderTeamId);
            Assert.Equal(first.Id, stats.LargestRemainingPurseTeamId);
            Assert.Equal(9000, stats.Teams.Single(t => t.Standing.TeamId == first.Id).Standing.RemainingPurse);
            Assert.Equal(7000, stats.Teams.Single(t => t.Standing.TeamId == second.Id).Standing.RemainingPurse);
            Assert.Equal(two.PlayerId, stats.Teams.Single(t => t.Standing.TeamId == second.Id).MostExpensiveSigning!.PlayerId);
            Assert.Equal(3000, stats.Positions.Single(p => p.Position == "Defender").TotalSpent);
            Assert.Equal(4000, Assert.Single(stats.Sets).TotalSpent);
            Assert.Equal(2, stats.MostExpensiveByPosition.Count);
            Assert.Equal(two.PlayerId, Assert.Single(stats.MostExpensiveBySet).PlayerId);
        }
    }

    [Fact]
    public async Task FinalRoundSalesCountOnceInResultsAndSetStatistics()
    {
        var (db, engine, tournament, first, second, set) = await Setup();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var unsold = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(unsold.LotId), owner);
            var sold = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(sold.LotId, first.Id, 1000), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await engine.StartUnsoldRoundAsync(tournament.Id, owner);
            var retry = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(retry.LotId, second.Id, 2000), owner);
            await engine.CompleteAuctionAsync(tournament.Id, null, owner);
            var results = await engine.GetPublicAuctionResultsAsync(tournament.Id.ToString());
            Assert.Equal("COMPLETED", results.State.SessionStatus);
            Assert.Equal(2, results.Players.Count);
            Assert.Equal(2, results.Statistics.SoldPlayers);
            Assert.Equal(0, results.Statistics.UnsoldPlayers);
            Assert.Equal(100, results.Statistics.SalePercentage);
            Assert.Equal(3000, results.Statistics.TotalSpent);
            Assert.Equal(2, results.Players.Single(p => p.PlayerId == unsold.PlayerId).AttemptCount);
            var summary = Assert.Single(results.Statistics.Sets);
            Assert.Equal(2, summary.PlayerCount);
            Assert.Equal(2, summary.SoldCount);
            Assert.Equal(0, summary.UnsoldCount);
            Assert.Equal(100, summary.SellThroughPercentage);
        }
    }

    [Fact]
    public async Task ResultsBeforeSalesHaveSafeEmptyAggregatesAndNoFutureDrawData()
    {
        var (db, engine, tournament, _, _, set) = await Setup();
        using (db)
        {
            await engine.StartSetAsync(tournament.Id, new(set.Id), tournament.OwnerUserId);
            var results = await engine.GetPublicAuctionResultsAsync(tournament.Slug);
            Assert.Equal(2, results.Statistics.AvailablePlayers);
            Assert.Equal(0, results.Statistics.TotalSpent);
            Assert.Equal(0, results.Statistics.AverageSalePrice);
            Assert.Equal(0, results.Statistics.MedianSalePrice);
            Assert.Empty(results.Statistics.TopPlayers);
            Assert.All(results.Players, player => Assert.Equal(0, player.AttemptCount));
            var json = JsonSerializer.Serialize(results).ToLowerInvariant();
            foreach (var forbidden in new[] { "drawposition", "auctionsessionid", "eventdata", "userid", "password", "reason" })
                Assert.DoesNotContain(forbidden, json);
            Assert.Equal(results.Players.OrderBy(p => p.PlayerName).Select(p => p.PlayerId), results.Players.Select(p => p.PlayerId));
        }
    }

    [Fact]
    public async Task PublicResultsRespectVisibilityAndPrivateResultsRequireMembership()
    {
        var (db, engine, tournament, _, _, _) = await Setup(0);
        using (db)
        {
            tournament.Settings!.PublicLiveViewEnabled = false;
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<KeyNotFoundException>(() => engine.GetPublicAuctionResultsAsync(tournament.Slug));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => engine.GetAuctionResultsAsync(tournament.Id, Guid.NewGuid()));
            var results = await engine.GetAuctionResultsAsync(tournament.Id, tournament.OwnerUserId);
            Assert.False(results.PublicLiveViewEnabled);
            Assert.Equal(0, results.Statistics.TotalPlayers);
            Assert.Equal(0, results.Statistics.SalePercentage);
            Assert.Null(results.Statistics.BestSellingSetId);
            Assert.Null(results.Statistics.BiggestPricePremium);
        }
    }

    [Fact]
    public async Task RankingsLimitToTenAndComputeOddMedianAndPositionDistribution()
    {
        var (db, engine, tournament, first, _, set) = await Setup(11);
        using (db)
        {
            var session = await db.AuctionSessions.SingleAsync();
            var players = await db.Players.OrderBy(p => p.Name).ToListAsync();
            for (var i = 0; i < players.Count; i++)
            {
                players[i].Status = "SOLD";
                players[i].Position = i % 2 == 0 ? "Forward" : "forward";
                db.AuctionLots.Add(new AuctionLot { AuctionSessionId = session.Id, TournamentId = tournament.Id,
                    PlayerId = players[i].Id, PlayerSetId = set.Id, AttemptNumber = 1, DrawPosition = i + 1,
                    Status = AuctionLotStatus.SOLD, WinningTeamId = first.Id, FinalPrice = (i + 1) * 500,
                    RevealedAtUtc = DateTime.UtcNow, CompletedAtUtc = DateTime.UtcNow });
            }
            await db.SaveChangesAsync();
            var stats = (await engine.GetPublicAuctionResultsAsync(tournament.Slug)).Statistics;
            Assert.Equal(10, stats.TopPlayers.Count);
            Assert.Equal(5500, stats.TopPlayers[0].FinalPrice);
            Assert.Equal(3000, stats.MedianSalePrice);
            Assert.Equal(3000, stats.AverageSalePrice);
            Assert.Equal(33000, stats.TotalSpent);
            Assert.Equal(11, Assert.Single(stats.Positions).PlayerCount);
            Assert.Equal(33000, Assert.Single(stats.Teams.Single(t => t.Standing.TeamId == first.Id).Positions).TotalSpent);
        }
    }
}
