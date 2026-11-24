using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.FanChoice;
using TournamentAuction.Api.Features.Tournaments;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Tests;

public class FanChoiceTests
{
    private const string BrowserA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private const string BrowserB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    private static async Task<(TournamentAuctionDbContext Db, FanChoiceService Service, Tournament Tournament, Player[] Players, RecordingHub Hub)> Setup()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = new User { FullName = "Owner", Email = "fan-owner@example.test", PasswordHash = "test" };
        var t = new Tournament { Name = "Fan Cup", Slug = "fan-cup", Status = TournamentStatus.COMPLETED, OwnerUserId = owner.Id,
            Settings = new TournamentSettings { PublicLiveViewEnabled = true, MaximumSquadSize = 6 } };
        var teams = new[] { new Team { TournamentId = t.Id, Name = "Falcons", ShortName = "FLC", InitialPurse = 10000 }, new Team { TournamentId = t.Id, Name = "Warriors", ShortName = "WAR", InitialPurse = 10000 } };
        var set = new PlayerSet { TournamentId = t.Id, Name = "Main" };
        var session = new AuctionSession { TournamentId = t.Id, Status = AuctionSessionStatus.COMPLETED };
        db.AddRange(owner, t, set, session, new TournamentMember { TournamentId = t.Id, UserId = owner.Id, Role = TournamentRole.OWNER }); db.AddRange(teams);
        var players = Enumerable.Range(0, 8).Select(i => new Player { TournamentId = t.Id, PlayerSetId = set.Id, Name = $"Player {i}", PhotoUrl = $"https://photos.test/{i}.png", Position = "Forward", BasePrice = 500,
            AssignedTeamId = i < 3 ? teams[0].Id : i < 5 ? teams[1].Id : null,
            AssignedRole = i is 0 or 3 ? "CAPTAIN" : i < 5 ? "ICON" : null,
            Status = i < 5 ? "ASSIGNED" : i < 7 ? "SOLD" : "FINAL_UNSOLD" }).ToArray();
        db.Players.AddRange(players);
        for (var i = 5; i < 7; i++) db.AuctionLots.Add(new AuctionLot { AuctionSessionId = session.Id, TournamentId = t.Id, PlayerSetId = set.Id, PlayerId = players[i].Id, AttemptNumber = 1,
            Status = AuctionLotStatus.SOLD, WinningTeamId = teams[i - 5].Id, FinalPrice = i == 5 ? 500 : 1000 });
        await db.SaveChangesAsync();
        var hub = new RecordingHub();
        return (db, new FanChoiceService(db, hub, NullLogger<FanChoiceService>.Instance), t, players, hub);
    }

    private static async Task OpenAll(FanChoiceService service, Tournament t)
    {
        foreach (var d in FanChoiceCategories.All) await service.ConfigureAsync(t.Id, t.OwnerUserId, d.Key, new(true, true));
    }

    [Fact]
    public async Task FiveCategoriesHaveCorrectEligibilityAndIncludeEveryIconInFullSquads()
    {
        var (db, service, t, p, _) = await Setup(); using (db)
        {
            var admin = await service.GetAdminAsync(t.Id, t.OwnerUserId);
            Assert.Equal(5, admin.Polls.Count); Assert.All(admin.Polls, poll => Assert.False(poll.Enabled));
            await OpenAll(service, t);
            var page = await service.GetPublicAsync(t.Slug, null);
            Assert.Equal(5, page.Polls.Count);
            Assert.Equal(new[] { 2, 2, 8, 2, 3 }, page.Polls.Select(poll => poll.Options.Count));
            var bestBuy = page.Polls.Single(poll => poll.Category == "BEST_BUY");
            Assert.Equal(new long?[] { 500, 1000 }, bestBuy.Options.Select(o => o.Price).OrderBy(n => n));
            Assert.DoesNotContain(bestBuy.Options, o => o.Name == p[0].Name || o.Name == p[7].Name);
            var squad = page.Polls.Single(poll => poll.Category == "STRONGEST_SQUAD").Options.Single(o => o.Name == "Falcons");
            Assert.Equal(4, squad.Squad!.Count); Assert.Equal(2, squad.Squad.Count(member => member.Role == "ICON"));
            Assert.Contains(page.Polls.Single(poll => poll.Category == "FAVOURITE_PLAYER").Options, o => o.Name == p[7].Name);
            Assert.Equal(2, await db.AuctionLots.CountAsync()); // Voting never invents auction sales.
        }
    }

    [Fact]
    public async Task ResultsAreHiddenBeforeVotingAndUnlockOnlyForThatBrowserAndCategory()
    {
        var (db, service, t, _, hub) = await Setup(); using (db)
        {
            await OpenAll(service, t);
            var before = await service.GetPublicAsync(t.Slug, BrowserA);
            Assert.All(before.Polls, poll => { Assert.Null(poll.TotalVotes); Assert.All(poll.Options, o => { Assert.Null(o.Votes); Assert.Null(o.Percentage); }); });
            var poll = before.Polls[0];
            var result = await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            var voted = result.Polls[0];
            Assert.Equal(poll.Options[0].Id, voted.SelectedOptionId); Assert.Equal(1, voted.TotalVotes);
            Assert.Equal(100, voted.Options[0].Percentage); Assert.Equal(0, voted.Options[1].Percentage);
            Assert.All(result.Polls.Skip(1), other => Assert.Null(other.TotalVotes));
            var otherBrowser = await service.GetPublicAsync(t.Slug, BrowserB);
            Assert.Null(otherBrowser.Polls[0].TotalVotes); Assert.All(otherBrowser.Polls[0].Options, o => Assert.Null(o.Votes));
            Assert.Null((await service.GetPublicAsync(t.Slug, null)).Polls[0].TotalVotes);
            var message = hub.Messages.Last(); Assert.Equal(AuctionHub.FanChoiceGroup(t.Id), message.Group); Assert.Equal("FanChoiceChanged", message.Method);
            var raw = JsonSerializer.Serialize(message.Args); Assert.DoesNotContain(BrowserA, raw); Assert.DoesNotContain("Votes", raw);
            Assert.NotEqual(BrowserA, (await db.FanChoiceVotes.SingleAsync()).VoterHash);
        }
    }

    [Fact]
    public async Task VotesArePermanentAndRetriesCannotIncrementTheCount()
    {
        var (db, service, t, _, hub) = await Setup(); using (db)
        {
            await OpenAll(service, t); var poll = (await service.GetPublicAsync(t.Slug, null)).Polls[0];
            await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            var messages = hub.Messages.Count;
            await service.VoteAsync(t.Slug, poll.Id, BrowserA.ToUpperInvariant(), poll.Options[0].Id);
            Assert.Equal(messages, hub.Messages.Count);
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[1].Id));
            Assert.Single(db.FanChoiceVotes);
            db.ChangeTracker.Clear();
            Assert.Equal(poll.Options[0].Id, (await service.GetPublicAsync(t.Slug, BrowserA)).Polls[0].SelectedOptionId);
        }
    }

    [Fact]
    public async Task NewVotesUpdateCountsAndEachCategoryAllowsItsOwnSingleVote()
    {
        var (db, service, t, _, _) = await Setup(); using (db)
        {
            await OpenAll(service, t); var page = await service.GetPublicAsync(t.Slug, null); var poll = page.Polls[0];
            await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            await service.VoteAsync(t.Slug, poll.Id, BrowserB, poll.Options[1].Id);
            var fresh = (await service.GetPublicAsync(t.Slug, BrowserA)).Polls[0];
            Assert.Equal(2, fresh.TotalVotes); Assert.All(fresh.Options, o => { Assert.Equal(1, o.Votes); Assert.Equal(50, o.Percentage); });
            foreach (var other in page.Polls.Skip(1)) await service.VoteAsync(t.Slug, other.Id, BrowserA, other.Options[0].Id);
            Assert.Equal(6, await db.FanChoiceVotes.CountAsync());
            Assert.All((await service.GetPublicAsync(t.Slug, BrowserA)).Polls, p => Assert.NotNull(p.SelectedOptionId));
        }
    }

    [Fact]
    public async Task CloseDisableAndReopenKeepVotesAndOriginalChoices()
    {
        var (db, service, t, p, _) = await Setup(); using (db)
        {
            await OpenAll(service, t); var poll = (await service.GetPublicAsync(t.Slug, null)).Polls[0];
            await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            await service.ConfigureAsync(t.Id, t.OwnerUserId, poll.Category, new(true, false));
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.VoteAsync(t.Slug, poll.Id, BrowserB, poll.Options[0].Id));
            Assert.Equal(1, (await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id)).Polls[0].TotalVotes);
            await service.ConfigureAsync(t.Id, t.OwnerUserId, poll.Category, new(false, false));
            Assert.DoesNotContain((await service.GetPublicAsync(t.Slug, BrowserA)).Polls, value => value.Id == poll.Id);
            p[5].Name = "Renamed after opening"; await db.SaveChangesAsync();
            await service.ConfigureAsync(t.Id, t.OwnerUserId, poll.Category, new(true, true));
            var reopened = (await service.GetPublicAsync(t.Slug, BrowserA)).Polls[0];
            Assert.Equal(1, reopened.TotalVotes); Assert.Equal(poll.Options[0].Id, reopened.SelectedOptionId);
            Assert.DoesNotContain(reopened.Options, o => o.Name == "Renamed after opening");
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[1].Id));
        }
    }

    [Fact]
    public async Task WrongIdentityOptionsCategoriesAndTournamentAreRejectedWithoutVotes()
    {
        var (db, service, t, _, _) = await Setup(); using (db)
        {
            await OpenAll(service, t); var page = await service.GetPublicAsync(t.Slug, null); var poll = page.Polls[0];
            await Assert.ThrowsAsync<ArgumentException>(() => service.VoteAsync(t.Slug, poll.Id, null, poll.Options[0].Id));
            await Assert.ThrowsAsync<ArgumentException>(() => service.VoteAsync(t.Slug, poll.Id, "bad-token", poll.Options[0].Id));
            await Assert.ThrowsAsync<ArgumentException>(() => service.VoteAsync(t.Slug, poll.Id, BrowserA, page.Polls[1].Options[0].Id));
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.VoteAsync(t.Slug, Guid.NewGuid(), BrowserA, poll.Options[0].Id));
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.VoteAsync("different-cup", poll.Id, BrowserA, poll.Options[0].Id));
            Assert.Empty(db.FanChoiceVotes);
        }
    }

    [Fact]
    public async Task OnlyOwnersCanManageAndVotingRequiresCompletedPublicTournament()
    {
        var (db, service, t, _, _) = await Setup(); using (db)
        {
            var auctioneer = Guid.NewGuid(); db.TournamentMembers.Add(new() { TournamentId = t.Id, UserId = auctioneer, Role = TournamentRole.AUCTIONEER }); await db.SaveChangesAsync();
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.ConfigureAsync(t.Id, auctioneer, "BEST_BUY", new(true, true)));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.GetAdminAsync(t.Id, Guid.NewGuid()));
            t.Status = TournamentStatus.LIVE; await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.ConfigureAsync(t.Id, t.OwnerUserId, "BEST_BUY", new(true, true)));
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GetPublicAsync(t.Slug, null));
            t.Status = TournamentStatus.COMPLETED; t.Settings!.PublicLiveViewEnabled = false; await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.ConfigureAsync(t.Id, t.OwnerUserId, "BEST_BUY", new(true, true)));
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GetPublicAsync(t.Slug, null));
            t.Settings.PublicLiveViewEnabled = true; await db.SaveChangesAsync();
            await Assert.ThrowsAsync<ArgumentException>(() => service.ConfigureAsync(t.Id, t.OwnerUserId, "UNKNOWN", new(true, true)));
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.ConfigureAsync(t.Id, t.OwnerUserId, "BEST_BUY", new(false, true)));
        }
    }

    [Fact]
    public async Task EmptyCategoriesCannotOpenAndNewPollsHaveNoFabricatedResults()
    {
        var (db, service, t, p, _) = await Setup(); using (db)
        {
            await Assert.ThrowsAsync<KeyNotFoundException>(() => service.GetPublicAsync(t.Slug, null));
            db.Players.RemoveRange(p.Where(player => player.AssignedRole == "ICON")); await db.SaveChangesAsync();
            await Assert.ThrowsAsync<InvalidOperationException>(() => service.ConfigureAsync(t.Id, t.OwnerUserId, "BEST_ICON", new(true, true)));
            db.ChangeTracker.Clear();
            await service.ConfigureAsync(t.Id, t.OwnerUserId, "BEST_BUY", new(true, false));
            var poll = Assert.Single((await service.GetPublicAsync(t.Slug, null)).Polls);
            Assert.False(poll.IsOpen); Assert.Empty(poll.Options); Assert.Null(poll.TotalVotes);
        }
    }

    [Fact]
    public async Task FanChoiceIsNotCopiedToMockAuctionsAndTournamentDeletionRemovesVotes()
    {
        var (db, service, t, _, _) = await Setup(); using (db)
        {
            await OpenAll(service, t); var poll = (await service.GetPublicAsync(t.Slug, null)).Polls[0];
            await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            var tournaments = new TournamentService(db);
            var clone = await tournaments.CloneTournamentAsync(t.Id, new("Fan mock"), t.OwnerUserId);
            Assert.Empty(await db.FanChoicePolls.Where(p => p.TournamentId == clone.Id).ToListAsync());
            await tournaments.DeleteTournamentAsync(t.Id, t.OwnerUserId);
            Assert.Empty(db.FanChoicePolls); Assert.Empty(db.FanChoiceOptions); Assert.Empty(db.FanChoiceVotes);
            Assert.True(await db.Tournaments.AnyAsync(value => value.Id == clone.Id));
        }
    }

    [Fact]
    public async Task HubFanChoiceAccessRequiresCompletedPublicTournament()
    {
        var (db, _, t, _, _) = await Setup(); using (db)
        {
            var groups = new RecordingGroups();
            var hub = new AuctionHub(db) { Context = new TestCaller(), Groups = groups };
            await hub.JoinFanChoice(t.Id.ToString());
            Assert.Equal(AuctionHub.FanChoiceGroup(t.Id), Assert.Single(groups.Joined));
            await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(() => hub.JoinFanChoice("invalid"));
            t.Settings!.PublicLiveViewEnabled = false; await db.SaveChangesAsync();
            await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(() => hub.JoinFanChoice(t.Id.ToString()));
            t.Settings.PublicLiveViewEnabled = true; t.Status = TournamentStatus.LIVE; await db.SaveChangesAsync();
            await Assert.ThrowsAsync<Microsoft.AspNetCore.SignalR.HubException>(() => hub.JoinFanChoice(t.Id.ToString()));
        }
    }

    [Fact]
    public async Task NotificationFailureDoesNotLoseOrRepeatACommittedVote()
    {
        var (db, service, t, _, hub) = await Setup(); using (db)
        {
            await OpenAll(service, t);
            var poll = (await service.GetPublicAsync(t.Slug, null)).Polls[0];
            hub.OnSend = () => throw new InvalidOperationException("Disconnected transport");
            var receipt = await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id);
            Assert.Equal(1, receipt.Polls[0].TotalVotes);
            Assert.Single(db.FanChoiceVotes);
            Assert.Equal(1, (await service.VoteAsync(t.Slug, poll.Id, BrowserA, poll.Options[0].Id)).Polls[0].TotalVotes);
        }
    }
}
