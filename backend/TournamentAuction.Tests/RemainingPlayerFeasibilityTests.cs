using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Auction;
using TournamentAuction.Api.Features.Preflight;
using Xunit;

namespace TournamentAuction.Tests;

public class RemainingPlayerFeasibilityTests
{
    [Fact]
    public void TotalPurseCannotSubstituteForAnIndividualAffordableAllocation()
    {
        Assert.Equal(PurchaseFeasibility.Infeasible, RemainingPlayerFeasibility.Check(new long[] { 8, 8, 4 },
            new[] { new PurchaseCapacity(10, 2, 0), new PurchaseCapacity(10, 2, 0) }));
        Assert.Equal(PurchaseFeasibility.Infeasible, RemainingPlayerFeasibility.Check(new long[] { 3000 },
            new[] { new PurchaseCapacity(10000, 0, 0), new PurchaseCapacity(2500, 1, 0) }));
        Assert.Equal(PurchaseFeasibility.Feasible, RemainingPlayerFeasibility.Check(new long[] { 3000 },
            new[] { new PurchaseCapacity(10000, 0, 0), new PurchaseCapacity(3000, 1, 0) }));
    }

    [Fact]
    public void MinimumSquadsAndActualPricesAreBothRequired()
    {
        Assert.Equal(PurchaseFeasibility.Infeasible, RemainingPlayerFeasibility.Check(new long[] { 2000, 500 },
            new[] { new PurchaseCapacity(2500, 2, 0), new PurchaseCapacity(400, 2, 1) }));
        Assert.Equal(PurchaseFeasibility.Infeasible, RemainingPlayerFeasibility.Check(Array.Empty<long>(), new[] { new PurchaseCapacity(1000, 2, 1) }));
    }

    [Fact]
    public void SearchFindsAnAllocationThatBothGreedyStrategiesMissAndFailsClosedOnWorkLimit()
    {
        var prices = new long[] { 5, 7, 1, 9, 6, 9 };
        var teams = new[] { new PurchaseCapacity(16, 3, 0), new PurchaseCapacity(9, 3, 0), new PurchaseCapacity(13, 3, 0) };
        Assert.Equal(PurchaseFeasibility.Feasible, RemainingPlayerFeasibility.Check(prices, teams));
        Assert.Equal(PurchaseFeasibility.SearchLimit, RemainingPlayerFeasibility.Check(prices, teams, searchLimit: 0));
    }

    [Fact]
    public void SolverAgreesWithExhaustiveAssignmentsForSmallPools()
    {
        var random = new Random(41);
        for (var run = 0; run < 250; run++)
        {
            var prices = Enumerable.Range(0, random.Next(1, 8)).Select(_ => (long)random.Next(1, 10)).ToArray();
            var teams = Enumerable.Range(0, 3).Select(_ => new PurchaseCapacity(random.Next(1, 22), random.Next(1, 4), random.Next(0, 2))).ToArray();
            bool Oracle(int offset)
            {
                if (offset == prices.Length) return teams.All(t => t.MinimumPlayersNeeded == 0);
                for (var i = 0; i < teams.Length; i++)
                {
                    var before = teams[i];
                    if (before.Slots <= 0 || before.Purse < prices[offset]) continue;
                    teams[i] = new(before.Purse - prices[offset], before.Slots - 1, Math.Max(0, before.MinimumPlayersNeeded - 1));
                    var result = Oracle(offset + 1);
                    teams[i] = before;
                    if (result) return true;
                }
                return false;
            }
            var expected = Oracle(0) ? PurchaseFeasibility.Feasible : PurchaseFeasibility.Infeasible;
            Assert.Equal(expected, RemainingPlayerFeasibility.Check(prices, teams));
        }
    }
}

public partial class AuctionWorkflowTests
{
    private static async Task<(TournamentAuction.Api.Data.TournamentAuctionDbContext db, AuctionEngineService engine, Tournament tournament, Team first, Team second, PlayerSet set)> SetupAllocationProtection()
    {
        var fixture = await Setup(4);
        fixture.tournament.Settings!.SellAllPlayers = true;
        fixture.first.InitialPurse = 2000;
        fixture.second.InitialPurse = 4000;
        var players = await fixture.db.Players.OrderBy(p => p.Name).ToListAsync();
        players[3].BasePrice = 3000;
        await fixture.db.SaveChangesAsync();
        await fixture.engine.StartSetAsync(fixture.tournament.Id, new(fixture.set.Id), fixture.tournament.OwnerUserId);
        // Persist a controlled draw so the expensive player is last in this regression scenario.
        var lots = await fixture.db.AuctionLots.Include(l => l.Player).OrderBy(l => l.Player.Name).ToListAsync();
        for (var i = 0; i < lots.Count; i++) lots[i].DrawPosition = i + 1;
        await fixture.db.SaveChangesAsync();
        return fixture;
    }

    [Fact]
    public async Task BidsAndSalesCannotStrandTheLastExpensivePlayer()
    {
        var (db, engine, tournament, first, second, _) = await SetupAllocationProtection();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            for (var i = 0; i < 2; i++)
            {
                var cheap = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                await engine.SellCurrentPlayerAsync(tournament.Id, new(cheap.LotId, first.Id, 500), owner);
            }
            var state = await engine.RevealNextPlayerAsync(tournament.Id, owner);
            var lot = state.CurrentLot!;
            var auditCount = await db.AuctionEvents.CountAsync();
            var bidError = await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lot.LotId, 1500, second.Id), owner));
            Assert.Contains("actual base prices", bidError.Message);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lot.LotId, 1500, null), owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, second.Id, 1500), owner));
            var unchanged = await engine.GetAuctionStateAsync(tournament.Id, owner);
            Assert.Equal(state.Version, unchanged.Version);
            Assert.Equal(lot.CurrentBid, unchanged.CurrentLot!.CurrentBid);
            Assert.Equal(auditCount, await db.AuctionEvents.CountAsync());
            await engine.UpdateBidAsync(tournament.Id, new(lot.LotId, 1000, second.Id), owner);
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, second.Id, 1000), owner);
            var last = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            Assert.Equal(3000, last.BasePrice);
            var sold = await engine.SellCurrentPlayerAsync(tournament.Id, new(last.LotId, second.Id, 3000), owner);
            Assert.Equal(4, sold.TotalSoldPlayersCount);
            Assert.Equal(0, sold.TeamStandings.Single(t => t.TeamId == second.Id).RemainingPurse);
        }
    }

    [Fact]
    public async Task CorrectionIsValidatedAfterRefundingTheOldResult()
    {
        var (db, engine, tournament, first, second, _) = await SetupAllocationProtection();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, first.Id, 500), owner);
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 1500, "Would strand expensive player"), owner));
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, first.Id, 2000, "Would consume needed capacity"), owner));
            Assert.Equal(0, await db.AuctionEvents.CountAsync(e => e.EventType == AuctionEventTypes.ResultCorrected));
            var corrected = await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, first.Id, 1000, "Valid same-team refund"), owner);
            Assert.Equal(1000, corrected.TeamStandings.Single(t => t.TeamId == first.Id).RemainingPurse);
            corrected = await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, second.Id, 500, "Valid team transfer"), owner);
            Assert.Equal(2000, corrected.TeamStandings.Single(t => t.TeamId == first.Id).RemainingPurse);
            Assert.Equal(3500, corrected.TeamStandings.Single(t => t.TeamId == second.Id).RemainingPurse);
        }
    }

    [Fact]
    public async Task DefaultModeDoesNotApplyTheSellAllRestriction()
    {
        var (db, engine, tournament, first, second, _) = await SetupAllocationProtection();
        using (db)
        {
            tournament.Settings!.SellAllPlayers = false;
            await db.SaveChangesAsync();
            var owner = tournament.OwnerUserId;
            for (var i = 0; i < 2; i++)
            {
                var cheap = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                await engine.SellCurrentPlayerAsync(tournament.Id, new(cheap.LotId, first.Id, 500), owner);
            }
            var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await engine.UpdateBidAsync(tournament.Id, new(lot.LotId, 1500, second.Id), owner);
            await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, second.Id, 1500), owner);
            Assert.Equal(2500, (await engine.GetAuctionStateAsync(tournament.Id, owner)).TeamStandings.Single(t => t.TeamId == second.Id).RemainingPurse);
        }
    }

    [Fact]
    public void LargePoolWithAnObviousAllocationUsesTheFastWitness()
    {
        var capacities = Enumerable.Range(0, 20).Select(_ => new PurchaseCapacity(50000, 100, 10));
        Assert.Equal(PurchaseFeasibility.Feasible, RemainingPlayerFeasibility.Check(Enumerable.Repeat(500L, 1000), capacities, searchLimit: 0));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task ProtectionIncludesFutureSetsAndPreviouslyUnsoldPlayers(bool futureSet)
    {
        var (db, engine, tournament, first, second, set) = await SetupAllocationProtection();
        using (db)
        {
            var owner = tournament.OwnerUserId;
            var expensive = await db.AuctionLots.Include(l => l.Player).SingleAsync(l => l.Player.BasePrice == 3000);
            if (futureSet)
            {
                var later = new PlayerSet { TournamentId = tournament.Id, Name = "Later expensive set", SortOrder = 2 };
                db.Add(later);
                expensive.Player.PlayerSetId = later.Id;
                db.AuctionLots.Remove(expensive);
                await db.SaveChangesAsync();
            }
            else
            {
                expensive.DrawPosition = 0;
                await db.SaveChangesAsync();
                var lot = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                Assert.Equal(3000, lot.BasePrice);
                await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(lot.LotId), owner);
            }
            for (var i = 0; i < 2; i++)
            {
                var cheap = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
                await engine.SellCurrentPlayerAsync(tournament.Id, new(cheap.LotId, first.Id, 500), owner);
            }
            var current = (await engine.RevealNextPlayerAsync(tournament.Id, owner)).CurrentLot!;
            await Assert.ThrowsAsync<InvalidOperationException>(() => engine.SellCurrentPlayerAsync(tournament.Id, new(current.LotId, second.Id, 1500), owner));
            await engine.SellCurrentPlayerAsync(tournament.Id, new(current.LotId, second.Id, 1000), owner);
        }
    }

    [Fact]
    public async Task PreflightRejectsUnallocatablePoolEvenWithSufficientTotalPurse()
    {
        var (db, _, tournament, first, second, _) = await Setup(3);
        using (db)
        {
            db.Add(new TournamentMember { TournamentId = tournament.Id, UserId = tournament.OwnerUserId, Role = TournamentRole.OWNER });
            tournament.Settings!.SellAllPlayers = true;
            first.InitialPurse = second.InitialPurse = 10000;
            var players = await db.Players.OrderBy(p => p.Name).ToListAsync();
            players[0].BasePrice = players[1].BasePrice = 8000;
            players[2].BasePrice = 4000;
            await db.SaveChangesAsync();
            var report = await new TournamentPreflightService(db).RunPreflightAsync(tournament.Id, tournament.OwnerUserId);
            Assert.Contains(report.Checks, c => c.Key == "SELL_ALL_FEASIBILITY" && c.Status == "FAIL");
        }
    }
}
