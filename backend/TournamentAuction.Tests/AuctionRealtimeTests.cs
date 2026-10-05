using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Auction;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Tests;

public class AuctionRealtimeTests
{
    private async Task<(TournamentAuctionDbContext Db, AuctionEngineService Engine, RecordingHub Hub, Tournament Tournament, Team Team, Team OtherTeam, PlayerSet Set)> Setup()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var user = new User { FullName = "Owner", Email = "owner@test.local", PasswordHash = "test" };
        var tournament = new Tournament { Name = "Realtime Cup", Slug = "realtime-cup", OwnerUserId = user.Id,
            Status = TournamentStatus.READY, Settings = new TournamentSettings { MinimumSquadSize = 1, MaximumSquadSize = 3 } };
        var team = new Team { TournamentId = tournament.Id, Name = "Falcons", ShortName = "FFC", InitialPurse = 10000 };
        var other = new Team { TournamentId = tournament.Id, Name = "Warriors", ShortName = "WFC", InitialPurse = 10000 };
        var set = new PlayerSet { TournamentId = tournament.Id, Name = "Marquee", SortOrder = 1 };
        db.AddRange(user, tournament, team, other, set);
        db.Players.AddRange(Enumerable.Range(1, 2).Select(i => new Player { TournamentId = tournament.Id,
            PlayerSetId = set.Id, Name = $"Player {i}", BasePrice = 500, JerseyNumber = i }));
        await db.SaveChangesAsync();
        var hub = new RecordingHub { OnSend = () => Assert.DoesNotContain(db.ChangeTracker.Entries(),
            e => e.State is EntityState.Modified or EntityState.Added) };
        var engine = new AuctionEngineService(db, hub, NullLogger<AuctionEngineService>.Instance);
        return (db, engine, hub, tournament, team, other, set);
    }

    [Fact]
    public async Task CommandsBroadcastAfterCommitAndPublicMessagesAreSanitized()
    {
        var (db, engine, hub, tournament, team, other, set) = await Setup();
        var owner = tournament.OwnerUserId;
        await engine.StartAuctionAsync(tournament.Id, owner);
        await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
        var revealed = await engine.RevealNextPlayerAsync(tournament.Id, owner);
        var lot = revealed.CurrentLot!;
        await engine.UpdateBidAsync(tournament.Id, new(lot.LotId, 1000, team.Id), owner);
        var sold = await engine.SellCurrentPlayerAsync(tournament.Id, new(lot.LotId, team.Id, 1000), owner);
        Assert.Equal(9000, sold.TeamStandings.Single(t => t.TeamId == team.Id).RemainingPurse);
        await engine.CorrectAuctionResultAsync(tournament.Id, new(lot.LotId, other.Id, 1500, "Private audit reason"), owner);
        var publicState = await engine.GetPublicAuctionStateAsync(tournament.Slug);
        Assert.Equal(10000, publicState.TeamStandings.Single(t => t.TeamId == team.Id).RemainingPurse);
        Assert.Equal(other.Id, Assert.Single(publicState.SoldPlayers).WinningTeamId);
        Assert.Equal(8500, publicState.TeamStandings.Single(t => t.TeamId == other.Id).RemainingPurse);
        var second = await engine.RevealNextPlayerAsync(tournament.Id, owner);
        await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(second.CurrentLot!.LotId), owner);
        await engine.CompleteSetAsync(tournament.Id, set.Id, owner);
        await engine.PauseAuctionAsync(tournament.Id, owner);
        await engine.ResumeAuctionAsync(tournament.Id, owner);
        await engine.StartUnsoldRoundAsync(tournament.Id, owner);
        var retry = await engine.RevealNextPlayerAsync(tournament.Id, owner);
        await engine.MarkCurrentPlayerUnsoldAsync(tournament.Id, new(retry.CurrentLot!.LotId), owner);
        await engine.CompleteAuctionAsync(tournament.Id, new("Squad shortfall test"), owner);

        foreach (var eventName in new[] { "PlayerRevealed", "BidUpdated", "PlayerSold", "PlayerUnsold", "SetCompleted", "ResultCorrected", "AuctionStateChanged" })
        {
            Assert.Contains(hub.Messages, m => m.Group == AuctionHub.AdminGroup(tournament.Id) && m.Method == eventName);
            Assert.Contains(hub.Messages, m => m.Group == AuctionHub.PublicGroup(tournament.Id) && m.Method == eventName);
        }
        Assert.Equal("COMPLETED", hub.Messages.Last().Args[0]);
        var publicMessages = JsonSerializer.Serialize(hub.Messages.Where(m => m.Group.StartsWith("public:")));
        Assert.DoesNotContain("DrawPosition", publicMessages);
        Assert.DoesNotContain("Private audit reason", publicMessages);
        Assert.Contains("Private audit reason", JsonSerializer.Serialize(hub.Messages.Where(m => m.Group.StartsWith("admin:"))));
        db.Dispose();
    }

    [Fact]
    public async Task BidAndLastResultRestoreFromDatabaseWithoutExposingFuturePlayers()
    {
        var (db, engine, _, tournament, team, _, set) = await Setup();
        await engine.StartAuctionAsync(tournament.Id, tournament.OwnerUserId);
        await engine.StartSetAsync(tournament.Id, new(set.Id), tournament.OwnerUserId);
        var state = await engine.RevealNextPlayerAsync(tournament.Id, tournament.OwnerUserId);
        await engine.UpdateBidAsync(tournament.Id, new(state.CurrentLot!.LotId, 1250, team.Id), tournament.OwnerUserId);
        db.ChangeTracker.Clear();
        var restored = await engine.GetPublicAuctionStateAsync(tournament.Id.ToString());
        Assert.Equal(1250, restored.CurrentLot!.CurrentBid);
        Assert.Equal(team.Id, restored.CurrentLot.LeadingTeamId);
        var pendingName = await db.AuctionLots.Where(l => l.Status == AuctionLotStatus.PENDING).Select(l => l.Player.Name).SingleAsync();
        Assert.DoesNotContain(pendingName, JsonSerializer.Serialize(restored));
        Assert.DoesNotContain("DrawPosition", JsonSerializer.Serialize(restored));
        await engine.SellCurrentPlayerAsync(tournament.Id, new(restored.CurrentLot.LotId, team.Id, 1250), tournament.OwnerUserId);
        db.ChangeTracker.Clear();
        restored = await engine.GetPublicAuctionStateAsync(tournament.Slug);
        Assert.Null(restored.CurrentLot);
        Assert.Equal("SOLD", restored.LastResult!.Status);
        Assert.Equal(1250, restored.LastResult.FinalPrice);
    }

    [Fact]
    public async Task InvalidAndUnauthorizedBidsDoNotBroadcastOrChangeState()
    {
        var (db, engine, hub, tournament, team, _, set) = await Setup();
        var owner = tournament.OwnerUserId;
        await engine.StartAuctionAsync(tournament.Id, owner);
        await engine.StartSetAsync(tournament.Id, new(set.Id), owner);
        var state = await engine.RevealNextPlayerAsync(tournament.Id, owner);
        var lotId = state.CurrentLot!.LotId;
        hub.Messages.Clear();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => engine.UpdateBidAsync(tournament.Id, new(lotId, 1000, team.Id), Guid.NewGuid()));
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lotId, 100, team.Id), owner));
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lotId, 20000, team.Id), owner));
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lotId, 1000, Guid.NewGuid()), owner));
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(Guid.NewGuid(), 1000, team.Id), owner));
        Assert.Empty(hub.Messages);
        Assert.Null((await db.AuctionLots.FindAsync(lotId))!.CurrentBid);
        await engine.PauseAuctionAsync(tournament.Id, owner);
        await Assert.ThrowsAsync<InvalidOperationException>(() => engine.UpdateBidAsync(tournament.Id, new(lotId, 1000, team.Id), owner));
    }

    [Fact]
    public async Task FailedBroadcastDoesNotFailCommittedSale()
    {
        var (db, engine, hub, tournament, team, _, set) = await Setup();
        await engine.StartAuctionAsync(tournament.Id, tournament.OwnerUserId);
        await engine.StartSetAsync(tournament.Id, new(set.Id), tournament.OwnerUserId);
        var state = await engine.RevealNextPlayerAsync(tournament.Id, tournament.OwnerUserId);
        hub.OnSend = () => throw new IOException("Transport unavailable");
        var sold = await engine.SellCurrentPlayerAsync(tournament.Id, new(state.CurrentLot!.LotId, team.Id, 1000), tournament.OwnerUserId);
        Assert.Equal(1, sold.TotalSoldPlayersCount);
        Assert.Equal(AuctionLotStatus.SOLD, (await db.AuctionLots.FindAsync(state.CurrentLot.LotId))!.Status);
    }

    [Fact]
    public async Task PublicVisibilityGateAppliesToReadsAndBroadcasts()
    {
        var (db, engine, hub, tournament, _, _, _) = await Setup();
        tournament.Settings!.PublicLiveViewEnabled = false;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(() => engine.GetPublicAuctionStateAsync(tournament.Slug));
        await engine.StartAuctionAsync(tournament.Id, tournament.OwnerUserId);
        Assert.All(hub.Messages, message => Assert.StartsWith("admin:", message.Group));
    }

    [Fact]
    public async Task HubNormalizesGroupsAndRejectsPrivateTournamentOutsiders()
    {
        var (db, _, _, tournament, _, _, _) = await Setup();
        var groups = new RecordingGroups();
        var caller = new TestCaller();
        var hub = new AuctionHub(db) { Context = caller, Groups = groups };
        await hub.JoinAuction(tournament.Id.ToString().ToUpperInvariant());
        Assert.Equal(AuctionHub.PublicGroup(tournament.Id), Assert.Single(groups.Joined));
        await hub.LeaveAuction(tournament.Id.ToString());
        Assert.Contains(AuctionHub.AdminGroup(tournament.Id), groups.Left);
        Assert.Contains(AuctionHub.PublicGroup(tournament.Id), groups.Left);
        tournament.Settings!.PublicLiveViewEnabled = false;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<HubException>(() => hub.JoinAuction(tournament.Id.ToString()));
        await Assert.ThrowsAsync<HubException>(() => hub.JoinAuction("invalid"));
        caller.Identity = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, tournament.OwnerUserId.ToString())], "test"));
        await hub.JoinAuction(tournament.Id.ToString());
        Assert.Equal(AuctionHub.AdminGroup(tournament.Id), groups.Joined.Last());
    }
}

internal record SentMessage(string Group, string Method, object?[] Args);
internal sealed class RecordingHub : IHubContext<AuctionHub>
{
    public List<SentMessage> Messages { get; } = [];
    public Action? OnSend { get; set; }
    public IHubClients Clients => new RecordingClients(this);
    public IGroupManager Groups { get; } = new RecordingGroups();
    private sealed class RecordingProxy(RecordingHub hub, string group) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
        {
            hub.OnSend?.Invoke();
            hub.Messages.Add(new(group, method, args));
            return Task.CompletedTask;
        }
    }
    private sealed class RecordingClients(RecordingHub hub) : IHubClients
    {
        public IClientProxy All => new RecordingProxy(hub, "all");
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => All;
        public IClientProxy Client(string connectionId) => new RecordingProxy(hub, connectionId);
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => All;
        public IClientProxy Group(string groupName) => new RecordingProxy(hub, groupName);
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Group(groupName);
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => All;
        public IClientProxy User(string userId) => All;
        public IClientProxy Users(IReadOnlyList<string> userIds) => All;
    }
}
internal sealed class RecordingGroups : IGroupManager
{
    public List<string> Joined { get; } = [];
    public List<string> Left { get; } = [];
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) { Joined.Add(groupName); return Task.CompletedTask; }
    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) { Left.Add(groupName); return Task.CompletedTask; }
}
internal sealed class TestCaller : HubCallerContext
{
    public ClaimsPrincipal Identity { get; set; } = new();
    public override string ConnectionId => "test-connection";
    public override string? UserIdentifier => Identity.FindFirstValue(ClaimTypes.NameIdentifier);
    public override ClaimsPrincipal User => Identity;
    public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
    public override IFeatureCollection Features { get; } = new FeatureCollection();
    public override CancellationToken ConnectionAborted => CancellationToken.None;
    public override void Abort() { }
}
