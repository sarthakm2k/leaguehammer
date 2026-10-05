using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Preflight;
using TournamentAuction.Api.Features.Settings;
using Xunit;

namespace TournamentAuction.Tests;

public partial class AuctionWorkflowTests
{
    [Fact]
    public async Task SellAllPlayersContinuesAutomaticallyAndKeepsEveryAttempt()
    {
        var (db, engine, tournament, first, second, set) = await Setup();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            tournament.Settings!.SellAllPlayers = true;
            await db.SaveChangesAsync();
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            for (var i = 0; i < 2; i++)
            {
                var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(lot.LotId), owner);
            }
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await engine.StartUnsoldRoundAsync(tournament.Id, owner);
            var again = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            var waiting = await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(again.LotId), owner);
            Assert.Equal(2, waiting.CurrentAttemptNumber);
            Assert.Equal(1, waiting.UnsoldRoundRemainingCount);
            var sold = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            var next = await engine.SellCurrentPlayerAsync(tournament.Id, new(sold.LotId, first.Id, 1000), owner);
            Assert.Equal(3, next.CurrentAttemptNumber);
            Assert.Equal(1, next.UnsoldRoundRemainingCount);
            Assert.Equal("Unsold Round 2", next.CurrentSetName);
            Assert.True(next.SellAllPlayers);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartUnsoldRoundAsync(tournament.Id, owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CompleteAuctionAsync(tournament.Id, new("Cannot override unsold players"), owner));
            db.ChangeTracker.Clear();
            Assert.Equal(3, (await engine.GetAuctionStateAsync(tournament.Id, owner)).CurrentAttemptNumber);
            var third = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            Assert.Equal(again.PlayerId, third.PlayerId);
            Assert.Equal(3, third.AttemptNumber);
            var fourthState = await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(third.LotId), owner);
            Assert.Equal(4, fourthState.CurrentAttemptNumber);
            Assert.Equal("UNSOLD", (await db.Players.FindAsync(third.PlayerId))!.Status);
            var fourth = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            Assert.Equal(4, fourth.AttemptNumber);
            Assert.Equal(again.BasePrice, fourth.BasePrice);
            await engine.SellCurrentPlayerAsync(tournament.Id, new(fourth.LotId, second.Id, 1500), owner);
            var complete = await engine.CompleteAuctionAsync(tournament.Id, null, owner);
            Assert.Equal("COMPLETED", complete.SessionStatus);
            Assert.Equal(2, complete.TotalSoldPlayersCount);
            Assert.Equal(0, complete.TotalUnsoldPlayersCount);
            var history = await engine.GetAuctionHistoryAsync(tournament.Id, owner);
            Assert.Equal(new[] { 1, 2, 3, 4 }, history.Attempts.Where(a => a.PlayerId == again.PlayerId).OrderBy(a => a.AttemptNumber).Select(a => a.AttemptNumber));
            var results = await engine.GetPublicAuctionResultsAsync(tournament.Slug);
            Assert.Equal(2, results.Statistics.SoldPlayers);
            Assert.Equal(2500, results.Statistics.TotalSpent);
            Assert.Equal(4, results.Players.Single(p => p.PlayerId == again.PlayerId).AttemptCount);
            Assert.Equal(3, await db.AuctionEvents.CountAsync(e => e.EventType == AuctionEventTypes.UnsoldRoundStarted));
        }
    }

    [Fact]
    public async Task LastUnsoldResultQueuesNextRoundOnlyAfterAllLotsResolve()
    {
        var (db, engine, tournament, _, _, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            tournament.Settings!.SellAllPlayers = true;
            await db.SaveChangesAsync();
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var first = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(first.LotId), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await engine.StartUnsoldRoundAsync(tournament.Id, owner);
            var second = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(second.LotId), owner);
            Assert.Equal(3, await db.AuctionLots.CountAsync());
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(second.LotId), owner));
            Assert.Equal(3, await db.AuctionLots.CountAsync());
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(second.LotId, Guid.NewGuid(), 500, "Older attempt"), owner));
        }
    }

    [Fact]
    public async Task SellAllSettingIsOffByDefaultAndPersistsOnlyInDraft()
    {
        var (db, _, tournament, _, _, _) = await Setup();
        using (db)
        {
            Assert.False(tournament.Settings!.SellAllPlayers);
            db.Add(new TournamentMember { TournamentId = tournament.Id, UserId = tournament.OwnerUserId, Role = TournamentRole.OWNER });
            tournament.Status = TournamentStatus.DRAFT;
            await db.SaveChangesAsync();
            var service = new TournamentSettingsService(db);
            var request = new UpdateTournamentSettingsRequest("INR", "₹", 10000, 1, 4, 500, 250, true, true);
            Assert.True((await service.UpdateSettingsAsync(tournament.Id, request, tournament.OwnerUserId)).SellAllPlayers);
            Assert.True((await service.GetSettingsAsync(tournament.Id, tournament.OwnerUserId)).SellAllPlayers);
            tournament.Status = TournamentStatus.READY;
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateSettingsAsync(tournament.Id, request with { SellAllPlayers = false }, tournament.OwnerUserId));
        }
    }

    [Fact]
    public async Task SellAllPreflightBlocksInsufficientCapacityAndBudget()
    {
        var (db, _, tournament, first, second, _) = await Setup(5);
        using (db)
        {
            db.Add(new TournamentMember { TournamentId = tournament.Id, UserId = tournament.OwnerUserId, Role = TournamentRole.OWNER });
            tournament.Settings!.SellAllPlayers = true;
            await db.SaveChangesAsync();
            var service = new TournamentPreflightService(db);
            var report = await service.RunPreflightAsync(tournament.Id, tournament.OwnerUserId);
            Assert.Contains(report.Checks, c => c.Key == "SELL_ALL_FEASIBILITY" && c.Status == "FAIL");
            tournament.Settings.MaximumSquadSize = 4;
            first.InitialPurse = second.InitialPurse = 1000;
            await db.SaveChangesAsync();
            Assert.Contains((await service.RunPreflightAsync(tournament.Id, tournament.OwnerUserId)).Checks, c => c.Key == "SELL_ALL_FEASIBILITY" && c.Status == "FAIL");
            first.InitialPurse = second.InitialPurse = 10000;
            await db.SaveChangesAsync();
            Assert.Contains((await service.RunPreflightAsync(tournament.Id, tournament.OwnerUserId)).Checks, c => c.Key == "SELL_ALL_FEASIBILITY" && c.Status == "PASS");
        }
    }
}
