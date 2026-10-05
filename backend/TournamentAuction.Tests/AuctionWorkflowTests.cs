using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Auction;
using Xunit;

namespace TournamentAuction.Tests;

public class AuctionWorkflowTests
{
    private static async Task<(TournamentAuctionDbContext db, AuctionEngineService engine, Tournament tournament, Team first, Team second, PlayerSet set)> Setup(int players = 2)
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = new User { FullName = "Owner", Email = "owner@example.test", PasswordHash = "hash" };
        var tournament = new Tournament { Name = "Workflow Cup", Slug = "workflow-cup", Season = "2026", OwnerUserId = owner.Id,
            Status = TournamentStatus.READY, Settings = new TournamentSettings { MinimumSquadSize = 1, MaximumSquadSize = 2,
                MinimumAcquisitionPrice = 500, PublicLiveViewEnabled = true } };
        var first = new Team { TournamentId = tournament.Id, Name = "Falcons", ShortName = "FFC", InitialPurse = 10000 };
        var second = new Team { TournamentId = tournament.Id, Name = "Warriors", ShortName = "WFC", InitialPurse = 10000 };
        var set = new PlayerSet { TournamentId = tournament.Id, Name = "Marquee", SortOrder = 1 };
        db.AddRange(owner, tournament, first, second, set);
        db.Players.AddRange(Enumerable.Range(1, players).Select(i => new Player { TournamentId = tournament.Id,
            PlayerSetId = set.Id, Name = $"Player {i}", BasePrice = 500 }));
        await db.SaveChangesAsync();
        var engine = new AuctionEngineService(db, new RecordingHub(), NullLogger<AuctionEngineService>.Instance);
        await engine.StartAuctionAsync(tournament.Id, owner.Id);
        return (db, engine, tournament, first, second, set);
    }

    [Fact]
    public async Task FinalRoundPreservesFirstAttemptAndCountsEachPlayerOnce()
    {
        var (db, engine, tournament, first, second, set) = await Setup();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var original = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(original.LotId), owner);
            var normal = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(normal.LotId, first.Id, 1000), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CompleteAuctionAsync(tournament.Id, new("Cannot bypass mandatory round"), owner));
            var round = await engine.StartUnsoldRoundAsync(tournament.Id, owner);
            Assert.Equal(1, round.UnsoldRoundRemainingCount);
            Assert.Equal(1, round.CompletedSetsCount);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartUnsoldRoundAsync(tournament.Id, owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(original.LotId, second.Id, 700, "Stale attempt"), owner));
            var retry = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            Assert.Equal(original.PlayerId, retry.PlayerId);
            Assert.Equal(original.BasePrice, retry.BasePrice);
            Assert.Equal(2, retry.AttemptNumber);
            Assert.NotEqual(original.LotId, retry.LotId);
            var sold = await engine.SellCurrentPlayerAsync(tournament.Id, new(retry.LotId, second.Id, 750), owner);
            Assert.Equal(2, sold.TotalSoldPlayersCount);
            Assert.Equal(0, sold.TotalUnsoldPlayersCount);
            Assert.Equal(0, sold.UnsoldRoundRemainingCount);
            var history = await engine.GetAuctionHistoryAsync(tournament.Id, owner);
            Assert.Equal(3, history.Attempts.Count);
            Assert.Equal("UNSOLD", history.Attempts.Single(a => a.LotId == original.LotId).Status);
            Assert.Equal("SOLD", history.Attempts.Single(a => a.LotId == retry.LotId).Status);
            var completed = await engine.CompleteAuctionAsync(tournament.Id, null, owner);
            Assert.Equal("COMPLETED", completed.SessionStatus);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(retry.LotId, second.Id, 900, "After completion"), owner));
        }
    }

    [Fact]
    public async Task NormalSetsCannotBeSkippedOrCompletedWithoutStarting()
    {
        var (db, engine, tournament, _, _, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            var later = new PlayerSet { TournamentId = tournament.Id, Name = "Later", SortOrder = 2 };
            db.Add(later);
            db.Add(new Player { TournamentId = tournament.Id, PlayerSetId = later.Id, Name = "Later Player", BasePrice = 500 });
            await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartSetAsync(tournament.Id, new(later.Id), owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CompleteSetAsync(tournament.Id, set.Id, owner));
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var draw = await db.AuctionLots.Select(l => new { l.Id, l.DrawPosition }).ToListAsync();
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            Assert.Equal(draw, await db.AuctionLots.Select(l => new { l.Id, l.DrawPosition }).ToListAsync());
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(lot.LotId), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartUnsoldRoundAsync(tournament.Id, owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CompleteAuctionAsync(tournament.Id, new("Skip later set"), owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartSetAsync(tournament.Id, new(set.Id), owner));
        }
    }

    [Fact]
    public async Task CorrectionRefundsSameTeamAndAppendsOldAndNewValues()
    {
        var (db, engine, tournament, first, second, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, first.Id, 9000), owner);
            var corrected = await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, first.Id, 9500, " Same team corrected price "), owner);
            Assert.Equal(500, corrected.TeamStandings.Single(t => t.TeamId == first.Id).RemainingPurse);
            var transferred = await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 1250, "Correct bidder"), owner);
            Assert.Equal(10000, transferred.TeamStandings.Single(t => t.TeamId == first.Id).RemainingPurse);
            Assert.Equal(8750, transferred.TeamStandings.Single(t => t.TeamId == second.Id).RemainingPurse);
            var events = await engine.GetAuctionEventsAsync(tournament.Id, owner);
            Assert.Single(events, e => e.EventType == AuctionEventTypes.PlayerSold);
            Assert.Equal(2, events.Count(e => e.EventType == AuctionEventTypes.ResultCorrected));
            using var details = JsonDocument.Parse(events.First(e => e.EventType == AuctionEventTypes.ResultCorrected).EventData);
            Assert.Equal(9500, details.RootElement.GetProperty("oldPrice").GetInt64());
            Assert.Equal(1250, details.RootElement.GetProperty("newPrice").GetInt64());
            Assert.Equal("SOLD", details.RootElement.GetProperty("newStatus").GetString());
        }
    }

    [Theory]
    [InlineData(750, " ")]
    [InlineData(499, "Below tournament floor")]
    [InlineData(10001, "Over purse")]
    [InlineData(10000000001, "Outside range")]
    public async Task InvalidCorrectionsDoNotChangePurseOrAudit(long price, string reason)
    {
        var (db, engine, tournament, first, _, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, first.Id, 1000), owner);
            var eventCount = await db.AuctionEvents.CountAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, first.Id, price, reason), owner));
            Assert.Equal(1000, (await db.AuctionLots.FindAsync(lot.LotId))!.FinalPrice);
            Assert.Equal(eventCount, await db.AuctionEvents.CountAsync());
        }
    }

    [Fact]
    public async Task CorrectionsRejectActiveAndOlderResults()
    {
        var (db, engine, tournament, first, _, set) = await Setup();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var earlier = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(earlier.LotId, first.Id, 1000), owner);
            var latest = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(earlier.LotId, first.Id, 1500, "Active player"), owner));
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(latest.LotId), owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(earlier.LotId, first.Id, 1500, "Older result"), owner));
            var converted = await engine.CorrectAuctionResultAsync(tournament.Id, new(latest.LotId, first.Id, 1500, "Latest was sold, entered unsold"), owner);
            Assert.Equal(2, converted.TotalSoldPlayersCount);
            Assert.Equal(0, converted.TotalUnsoldPlayersCount);
        }
    }

    [Fact]
    public async Task HistoryIsPrivateAndEventsArePagedWithoutLosingRecords()
    {
        var (db, engine, tournament, _, _, set) = await Setup();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            Assert.Empty((await engine.GetAuctionHistoryAsync(tournament.Id, owner)).Attempts);
            await engine.RevealNextPlayerAsync(tournament.Id, owner);
            var first = await engine.GetAuctionEventsAsync(tournament.Id, owner, 2);
            var next = await engine.GetAuctionEventsAsync(tournament.Id, owner, 2, 2);
            Assert.Equal(await db.AuctionEvents.CountAsync(), first.Concat(next).Select(e => e.Id).Distinct().Count());
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => engine.GetAuctionHistoryAsync(tournament.Id, Guid.NewGuid()));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => engine.GetAuctionEventsAsync(tournament.Id, Guid.NewGuid()));
        }
    }

    [Fact]
    public async Task SquadShortfallOverrideRequiresOwnerAndKeepsReason()
    {
        var (db, engine, tournament, first, _, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            var auctioneer = new User { FullName = "Auctioneer", Email = "auctioneer@example.test", PasswordHash = "hash" };
            db.Add(auctioneer);
            db.Add(new TournamentMember { TournamentId = tournament.Id, UserId = auctioneer.Id, Role = TournamentRole.AUCTIONEER });
            await db.SaveChangesAsync();
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, first.Id, 750), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => engine.CompleteAuctionAsync(tournament.Id, new("Squad override"), auctioneer.Id));
            await engine.CompleteAuctionAsync(tournament.Id, new("Owner approved squad shortfall"), owner);
            var events = await engine.GetAuctionEventsAsync(tournament.Id, owner);
            Assert.Contains(events, e => e.EventType == AuctionEventTypes.AuctionCompleted && e.EventData.Contains("Owner approved squad shortfall"));
        }
    }

    [Fact]
    public async Task CorrectionEnforcesTournamentFloorAndMinimumSquadReserve()
    {
        var (db, engine, tournament, first, second, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            tournament.Settings!.MinimumSquadSize = 2;
            (await db.Players.SingleAsync()).BasePrice = 100;
            await db.SaveChangesAsync();
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, first.Id, 1000), owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 499, "Above base but below floor"), owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 9501, "Would consume squad reserve"), owner));
            await engine.PauseAuctionAsync(tournament.Id, owner);
            var corrected = await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 9500, "At reserve limit while paused"), owner);
            Assert.Equal("PAUSED", corrected.SessionStatus);
            Assert.Equal(500, corrected.TeamStandings.Single(t => t.TeamId == second.Id).RemainingPurse);
        }
    }

    [Fact]
    public async Task CorrectionCannotOverfillSquad()
    {
        var (db, engine, tournament, first, _, set) = await Setup(3);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            for (var i = 0; i < 2; i++)
            {
                var sold = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                await engine.SellCurrentPlayerAsync(tournament.Id, new(sold.LotId, first.Id, 500), owner);
            }
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(lot.LotId), owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, first.Id, 500, "Team already full"), owner));
            Assert.Equal(2, await db.AuctionLots.CountAsync(l => l.WinningTeamId == first.Id && l.Status == AuctionLotStatus.SOLD));
        }
    }

    [Fact]
    public async Task FinalUnsoldIsCountedOnceAndCannotHaveAThirdAttempt()
    {
        var (db, engine, tournament, _, _, set) = await Setup(1);
        using (db)
        {
            var owner = tournament.OwnerUserId;
            await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
            var first = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(first.LotId), owner);
            await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
            await engine.StartUnsoldRoundAsync(tournament.Id, owner);
            var second = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            var state = await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(second.LotId), owner);
            Assert.Equal(1, state.TotalUnsoldPlayersCount);
            Assert.Equal(0, state.UnsoldRoundRemainingCount);
            Assert.Equal("FINAL_UNSOLD", (await db.Players.SingleAsync()).Status);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.StartUnsoldRoundAsync(tournament.Id, owner));
            Assert.Equal(2, await db.AuctionLots.CountAsync());
        }
    }
}
