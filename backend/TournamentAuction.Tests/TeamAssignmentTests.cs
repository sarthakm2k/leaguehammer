using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Auction;
using TournamentAuction.Api.Features.Teams;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Preflight;
using TournamentAuction.Api.Features.Tournaments;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Tests;

public class TeamAssignmentTests
{
    private static async Task<(TournamentAuctionDbContext db,AuctionEngineService engine,TeamAssignmentService assignments,Tournament t,Team first,Team second,Player[] players,PlayerSet leaders,PlayerSet auctionSet)> Setup(int auctionPlayers=2)
    {
        var db=new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner=new User {FullName="Owner",Email="owner@example.test",PasswordHash="test"};
        var t=new Tournament {Name="Captain Cup",Slug="captain-cup",OwnerUserId=owner.Id,Settings=new TournamentSettings {MinimumSquadSize=3,MaximumSquadSize=4,MinimumAcquisitionPrice=500,DefaultStartingPurse=3000,PublicLiveViewEnabled=true}};
        var first=new Team {TournamentId=t.Id,Name="Falcons",ShortName="FLC",InitialPurse=3000};
        var second=new Team {TournamentId=t.Id,Name="Warriors",ShortName="WAR",InitialPurse=3000};
        var leaders=new PlayerSet {TournamentId=t.Id,Name="Leadership",SortOrder=1};var auctionSet=new PlayerSet {TournamentId=t.Id,Name="Auction",SortOrder=2};
        db.AddRange(owner,t,first,second,leaders,auctionSet,new TournamentMember {TournamentId=t.Id,UserId=owner.Id,Role=TournamentRole.OWNER});
        var players=Enumerable.Range(0,4+auctionPlayers).Select(i=>new Player {TournamentId=t.Id,PlayerSetId=i<4?leaders.Id:auctionSet.Id,Name=$"Player {i}",BasePrice=500,Position=i%2==0?"Goalkeeper":"Forward",PhotoUrl=$"https://photos.test/{i}.png"}).ToArray();
        db.Players.AddRange(players);await db.SaveChangesAsync();
        var services=new ServiceCollection();services.AddLogging();services.AddSignalR();var provider=services.BuildServiceProvider();
        var engine=new AuctionEngineService(db,provider.GetRequiredService<IHubContext<AuctionHub>>(),NullLogger<AuctionEngineService>.Instance);
        return(db,engine,new TeamAssignmentService(db),t,first,second,players,leaders,auctionSet);
    }
    [Fact]
    public async Task CaptainsAndIconsAreDistinctFreeSquadMembersWithoutAuctionOutcomes()
    {
        var(db,engine,assign,t,first,second,p,_,_)=await Setup();
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));
        await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[2].Id,p[3].Id));
        var state=await engine.GetAuctionStateAsync(t.Id,t.OwnerUserId);Assert.Equal(2,state.TotalPlayersCount);Assert.Equal(1,state.TotalSetsCount);
        Assert.All(state.TeamStandings,s=>{Assert.Equal(2,s.CurrentSquadSize);Assert.Equal(0,s.TotalSpent);Assert.Equal(3000,s.RemainingPurse);Assert.Equal(3000,s.MaximumAllowedBid);Assert.Equal(2,s.AssignedPlayers!.Count);});
        var results=await engine.GetPublicAuctionResultsAsync(t.Slug);
        Assert.Equal(6,results.Players.Count);Assert.Equal(4,results.Statistics.AssignedPlayers);Assert.Equal(0,results.Statistics.SoldPlayers);Assert.Equal(2,results.Statistics.AvailablePlayers);
        Assert.All(results.Players.Where(x=>x.AssignedTeamId!=null),x=>{Assert.Equal("ASSIGNED",x.Status);Assert.Null(x.FinalPrice);Assert.Null(x.WinningTeamId);Assert.Equal(0,x.AttemptCount);Assert.NotNull(x.AssignedTeamName);});
        Assert.Equal(2,results.Statistics.Teams.First(x=>x.Standing.TeamId==first.Id).Positions.Sum(x=>x.PlayerCount));Assert.Empty(db.AuctionLots);
        Assert.Equal(2,(await new TeamService(db).GetTeamByIdAsync(t.Id,first.Id,t.OwnerUserId))!.AssignedPlayers!.Count);
    }
    [Fact]
    public async Task AssignmentsCanBeSwappedOrReleasedAndCannotCrossTeamsOrTournaments()
    {
        var(db,_,assign,t,first,second,p,_,_)=await Setup();
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));
        await Assert.ThrowsAsync<ArgumentException>(()=>assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[0].Id)));
        await Assert.ThrowsAsync<InvalidOperationException>(()=>assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[0].Id,null)));
        var other=new Player {TournamentId=Guid.NewGuid(),PlayerSetId=Guid.NewGuid(),Name="Other"};db.Players.Add(other);await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(other.Id,null)));
        Assert.Equal("CAPTAIN",p[0].AssignedRole);Assert.Equal("ICON",p[1].AssignedRole);
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[1].Id,p[0].Id));Assert.Equal("ICON",p[0].AssignedRole);Assert.Equal("CAPTAIN",p[1].AssignedRole);
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(null,null));Assert.All(p.Take(2),x=>{Assert.Equal("AVAILABLE",x.Status);Assert.Null(x.AssignedTeamId);Assert.Null(x.AssignedRole);});
        await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[0].Id,null));Assert.Equal(second.Id,p[0].AssignedTeamId);
    }
    [Fact]
    public async Task OnlyOwnersInDraftCanAssignAndAuctionPlayersCannotBeAssigned()
    {
        var(db,_,assign,t,first,_,p,_,set)=await Setup();var viewer=Guid.NewGuid();db.TournamentMembers.Add(new TournamentMember {TournamentId=t.Id,UserId=viewer,Role=TournamentRole.VIEWER});await db.SaveChangesAsync();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(()=>assign.UpdateAsync(t.Id,first.Id,viewer,new(p[0].Id,null)));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(()=>assign.GetAsync(t.Id,first.Id,Guid.NewGuid()));
        t.Status=TournamentStatus.READY;await db.SaveChangesAsync();await Assert.ThrowsAsync<InvalidOperationException>(()=>assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,null)));
        t.Status=TournamentStatus.DRAFT;db.AuctionLots.Add(new AuctionLot {TournamentId=t.Id,PlayerId=p[0].Id,PlayerSetId=set.Id,AuctionSessionId=Guid.NewGuid()});await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,null)));Assert.Null(p[0].AssignedTeamId);
    }
    [Fact]
    public async Task AssignedPlayersCannotBeDeletedAndTeamDeletionRequiresRelease()
    {
        var(db,_,assign,t,first,_,p,_,_)=await Setup();await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));
        await Assert.ThrowsAsync<InvalidOperationException>(()=>new PlayerService(db).DeletePlayerAsync(t.Id,p[0].Id,t.OwnerUserId));
        await Assert.ThrowsAsync<InvalidOperationException>(()=>new TeamService(db).DeleteTeamAsync(t.Id,first.Id,t.OwnerUserId));
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(null,null));await new PlayerService(db).DeletePlayerAsync(t.Id,p[0].Id,t.OwnerUserId);Assert.False(await db.Players.AnyAsync(x=>x.Id==p[0].Id));
    }
    [Fact]
    public async Task AuctionSkipsLeadershipSetCountsAssignedSquadsAndCompletesWithoutSellingThem()
    {
        var(db,engine,assign,t,first,second,p,leaders,set)=await Setup();
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[2].Id,p[3].Id));
        t.Settings!.SellAllPlayers=true;await db.SaveChangesAsync();
        Assert.True((await new TournamentPreflightService(db).RunPreflightAsync(t.Id,t.OwnerUserId)).IsReadyForAuction);
        t.Status=TournamentStatus.READY;await db.SaveChangesAsync();await engine.StartAuctionAsync(t.Id,t.OwnerUserId);
        await engine.StartSetAsync(t.Id,new(set.Id),t.OwnerUserId);Assert.Equal(2,await db.AuctionLots.CountAsync());Assert.False(await db.AuctionLots.AnyAsync(l=>l.PlayerSetId==leaders.Id));
        var next=await engine.RevealNextPlayerAsync(t.Id,t.OwnerUserId);await engine.SellCurrentPlayerAsync(t.Id,new(next.CurrentLot!.LotId,first.Id,500),t.OwnerUserId);
        next=await engine.RevealNextPlayerAsync(t.Id,t.OwnerUserId);await engine.SellCurrentPlayerAsync(t.Id,new(next.CurrentLot!.LotId,second.Id,500),t.OwnerUserId);
        await engine.CompleteSetAsync(t.Id,set.Id,t.OwnerUserId);var completed=await engine.CompleteAuctionAsync(t.Id,null,t.OwnerUserId);
        Assert.Equal("COMPLETED",completed.SessionStatus);Assert.All(completed.TeamStandings,s=>{Assert.Equal(3,s.CurrentSquadSize);Assert.Equal(500,s.TotalSpent);Assert.Equal(2500,s.RemainingPurse);});
        var results=await engine.GetAuctionResultsAsync(t.Id,t.OwnerUserId);Assert.Equal(100,results.Statistics.SalePercentage);Assert.Equal(2,results.Statistics.SoldPlayers);Assert.Equal(4,results.Statistics.AssignedPlayers);Assert.Equal(1000,results.Statistics.TotalSpent);
    }
    [Fact]
    public async Task SquadMaximumAndSaleCorrectionsIncludePreassignedMembers()
    {
        var(db,engine,assign,t,first,second,p,_,set)=await Setup();await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));
        t.Settings!.MinimumSquadSize=1;t.Settings.MaximumSquadSize=2;t.Status=TournamentStatus.READY;await db.SaveChangesAsync();await engine.StartAuctionAsync(t.Id,t.OwnerUserId);
        // Start the first eligible set, since the unassigned leaders of the other team remain in it.
        await engine.StartSetAsync(t.Id,new(p[2].PlayerSetId),t.OwnerUserId);var state=await engine.RevealNextPlayerAsync(t.Id,t.OwnerUserId);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>engine.SellCurrentPlayerAsync(t.Id,new(state.CurrentLot!.LotId,first.Id,500),t.OwnerUserId));
        var sold=await engine.SellCurrentPlayerAsync(t.Id,new(state.CurrentLot!.LotId,second.Id,500),t.OwnerUserId);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>engine.CorrectAuctionResultAsync(t.Id,new(sold.LastResult!.LotId,first.Id,500,"Wrong team"),t.OwnerUserId));
        Assert.Equal(0,(await engine.GetAuctionStateAsync(t.Id,t.OwnerUserId)).TeamStandings.First(s=>s.TeamId==first.Id).TotalSpent);
    }
    [Fact]
    public async Task SellAllAllocationReservesCapacityForPreassignedPlayers()
    {
        var(db,engine,assign,t,first,second,p,_,set)=await Setup(4);
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[2].Id,p[3].Id));
        t.Settings!.SellAllPlayers=true;t.Status=TournamentStatus.READY;await db.SaveChangesAsync();await engine.StartAuctionAsync(t.Id,t.OwnerUserId);await engine.StartSetAsync(t.Id,new(set.Id),t.OwnerUserId);
        var state=await engine.RevealNextPlayerAsync(t.Id,t.OwnerUserId);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>engine.SellCurrentPlayerAsync(t.Id,new(state.CurrentLot!.LotId,first.Id,3000),t.OwnerUserId));
        await engine.SellCurrentPlayerAsync(t.Id,new(state.CurrentLot!.LotId,first.Id,2500),t.OwnerUserId);
        Assert.Equal(3,(await engine.GetAuctionStateAsync(t.Id,t.OwnerUserId)).TeamStandings.First(s=>s.TeamId==first.Id).CurrentSquadSize);
    }
    [Fact]
    public async Task PreflightRequiresEnoughUnassignedPlayersForEachTeamAndEnforcesAssignedLimits()
    {
        var(db,_,assign,t,first,_,p,_,_)=await Setup(0);
        t.Settings!.MinimumSquadSize=1;t.Settings.MaximumSquadSize=2;await db.SaveChangesAsync();
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));db.Players.RemoveRange(p.Skip(2));await db.SaveChangesAsync();
        var report=await new TournamentPreflightService(db).RunPreflightAsync(t.Id,t.OwnerUserId);Assert.Contains(report.Checks,x=>x.Key=="SQUAD_FEASIBILITY"&&x.Status=="FAIL");
        t.Settings.MaximumSquadSize=1;await db.SaveChangesAsync();report=await new TournamentPreflightService(db).RunPreflightAsync(t.Id,t.OwnerUserId);Assert.Contains(report.Checks,x=>x.Key=="TEAM_ASSIGNMENTS"&&x.Status=="FAIL");
    }
    [Fact]
    public async Task TournamentCloningPreservesRolesAndRemapsTeamsWithoutCopyingSales()
    {
        var(db,_,assign,t,first,second,p,_,_)=await Setup();await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[2].Id,p[3].Id));
        var clone=await new TournamentService(db).CloneTournamentAsync(t.Id,new("Mock Captain Cup"),t.OwnerUserId);
        var copies=await db.Players.Where(x=>x.TournamentId==clone.Id).ToListAsync();Assert.Equal(4,copies.Count(x=>x.Status=="ASSIGNED"));Assert.Equal(2,copies.Count(x=>x.Status=="AVAILABLE"));
        Assert.All(copies.Where(x=>x.AssignedTeamId!=null),x=>Assert.Contains(db.Teams.Where(team=>team.TournamentId==clone.Id),team=>team.Id==x.AssignedTeamId));Assert.Empty(db.AuctionLots);
        Assert.Equal(first.Id,p[0].AssignedTeamId);
    }
    [Fact]
    public async Task FullyPreassignedSquadsCanCompleteWithoutInventingAuctionSales()
    {
        var(db,engine,assign,t,first,second,p,_,_)=await Setup(0);
        t.Settings!.MinimumSquadSize=2;t.Settings.MaximumSquadSize=2;t.Settings.SellAllPlayers=true;await db.SaveChangesAsync();
        await assign.UpdateAsync(t.Id,first.Id,t.OwnerUserId,new(p[0].Id,p[1].Id));await assign.UpdateAsync(t.Id,second.Id,t.OwnerUserId,new(p[2].Id,p[3].Id));
        Assert.True((await new TournamentPreflightService(db).RunPreflightAsync(t.Id,t.OwnerUserId)).IsReadyForAuction);
        t.Status=TournamentStatus.READY;await db.SaveChangesAsync();var state=await engine.StartAuctionAsync(t.Id,t.OwnerUserId);
        Assert.Equal(0,state.TotalPlayersCount);Assert.Equal(0,state.TotalSetsCount);
        state=await engine.CompleteAuctionAsync(t.Id,null,t.OwnerUserId);Assert.Equal("COMPLETED",state.SessionStatus);Assert.Equal(0,state.TotalSoldPlayersCount);Assert.Empty(db.AuctionLots);
    }
}
