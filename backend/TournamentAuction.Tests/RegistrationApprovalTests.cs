using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Registrations;

namespace TournamentAuction.Tests;

public partial class RegistrationTests
{
    [Fact]
    public async Task UndoApprovalPreservesSubmissionAndPhotoAndAllowsFreshApproval()
    {
        var (db,service,_,photos,t,set)=await Fixture();var request=Submission();
        var receipt=await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));
        var entry=await db.PlayerRegistrations.SingleAsync();var oldPlayerId=entry.PlayerId;var photo=entry.PhotoPath;
        var other=new Player {TournamentId=t.Id,PlayerSetId=set.Id,Name="Unrelated player"};db.Players.Add(other);await db.SaveChangesAsync();
        Assert.Equal(receipt,await service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,new(oldPlayerId)));
        Assert.Equal("PENDING",entry.Status);Assert.Null(entry.PlayerId);Assert.Null(entry.ReviewReason);
        Assert.Null(entry.ReviewedAtUtc);Assert.Null(entry.ReviewedByUserId);
        Assert.Equal(photo,entry.PhotoPath);Assert.Equal("Arjun Reviewed",entry.Name);Assert.Equal("player@example.test",entry.Email);
        Assert.Equal(other.Id,Assert.Single(db.Players).Id);Assert.Single(db.PlayerRegistrations);
        Assert.Equal(receipt,await service.GetReceiptAsync(t.Slug,entry.Id));
        await Assert.ThrowsAsync<InvalidOperationException>(()=>service.FinalizeAsync(t.Id,t.OwnerUserId));
        await service.ReviewAsync(t.Id,entry.Id,t.OwnerUserId,Review(set));
        Assert.Equal("APPROVED",entry.Status);Assert.NotNull(entry.PlayerId);Assert.NotEqual(oldPlayerId,entry.PlayerId);
        Assert.Equal(2,await db.Players.CountAsync());Assert.Equal(2,photos.Publications);
        Assert.Contains(photo!,db.Players.Single(p=>p.Id==entry.PlayerId).PhotoUrl!);
    }

    [Fact]
    public async Task RejectingApprovedRegistrationNeedsReasonAndUpdatesSharedStatus()
    {
        var (db,service,clock,photos,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));
        var entry=await db.PlayerRegistrations.SingleAsync();var playerId=entry.PlayerId;var photo=entry.PhotoPath;
        foreach(var reason in new[] {null,"","   ",new string('x',1001)})
            await Assert.ThrowsAsync<ArgumentException>(()=>service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,new(playerId,reason)));
        Assert.Equal("APPROVED",entry.Status);Assert.Single(db.Players);
        clock.Current=clock.Current.AddMinutes(5);
        await service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,new(playerId,"  Player withdrew  "));
        Assert.Equal("REJECTED",entry.Status);Assert.Equal("Player withdrew",entry.ReviewReason);
        Assert.Equal(clock.Current.UtcDateTime,entry.ReviewedAtUtc);Assert.Equal(t.OwnerUserId,entry.ReviewedByUserId);
        Assert.Null(entry.PlayerId);Assert.Empty(db.Players);Assert.Equal(photo,entry.PhotoPath);Assert.Single(db.PlayerRegistrations);
        var tokens=new RegistrationViewerTokens(System.Text.Encoding.UTF8.GetBytes("Registration-approval-test-secret-123456"));
        var viewer=new RegistrationViewerService(db,tokens,photos,clock);
        Assert.Equal("REJECTED",Assert.Single((await viewer.ListAsync(t.Slug,tokens.ForTournament(t.Id))).Players).Status);
    }

    [Theory]
    [InlineData(TournamentStatus.READY,false)]
    [InlineData(TournamentStatus.LIVE,true)]
    [InlineData(TournamentStatus.COMPLETED,false)]
    public async Task ApprovalChangesAreBlockedOutsideDraft(TournamentStatus status,bool reject)
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        t.Status=status;await db.SaveChangesAsync();
        var change=new RegistrationApprovalChangeRequest(entry.PlayerId,"Player withdrew");
        await Assert.ThrowsAsync<InvalidOperationException>(()=>reject ? service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,change) : service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,change));
        Assert.Equal("APPROVED",entry.Status);Assert.Single(db.Players);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task FinalizationBlocksApprovalChanges(bool reject)
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        await service.FinalizeAsync(t.Id,t.OwnerUserId);var change=new RegistrationApprovalChangeRequest(entry.PlayerId,"Withdrawn");
        await Assert.ThrowsAsync<InvalidOperationException>(()=>reject ? service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,change) : service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,change));
        Assert.Equal("APPROVED",entry.Status);Assert.Single(db.Players);
    }

    [Theory]
    [InlineData(false,AuctionLotStatus.PENDING)]
    [InlineData(true,AuctionLotStatus.SOLD)]
    public async Task AnyAuctionLotPreventsChangingApproval(bool reject,AuctionLotStatus status)
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        var lot=new AuctionLot {TournamentId=t.Id,AuctionSessionId=Guid.NewGuid(),PlayerId=entry.PlayerId!.Value,PlayerSetId=set.Id,Status=status};
        db.AuctionLots.Add(lot);await db.SaveChangesAsync();var change=new RegistrationApprovalChangeRequest(entry.PlayerId,"Withdrawn");
        var error=await Assert.ThrowsAsync<InvalidOperationException>(()=>reject ? service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,change) : service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,change));
        Assert.Contains("already entered an auction",error.Message);Assert.Single(db.AuctionLots);Assert.Single(db.Players);Assert.Equal("APPROVED",entry.Status);
    }

    [Theory]
    [InlineData("ON_AUCTION")]
    [InlineData("SOLD")]
    public async Task UnavailablePlayerStatusPreventsUndoEvenWithoutLot(string status)
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        db.Players.Single().Status=status;await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,new(entry.PlayerId)));
        Assert.Equal("APPROVED",entry.Status);Assert.Single(db.Players);
    }

    [Fact]
    public async Task UnrelatedUsersViewersAndOtherTournamentsCannotChangeApproval()
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        var viewer=Guid.NewGuid();db.TournamentMembers.Add(new TournamentMember {TournamentId=t.Id,UserId=viewer,Role=TournamentRole.VIEWER});
        var other=new Tournament {OwnerUserId=t.OwnerUserId};db.Tournaments.Add(other);await db.SaveChangesAsync();
        foreach(var user in new[] {viewer,Guid.NewGuid()}) {
            await Assert.ThrowsAsync<UnauthorizedAccessException>(()=>service.UndoApprovalAsync(t.Id,entry.Id,user,new(entry.PlayerId)));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(()=>service.RejectApprovedAsync(t.Id,entry.Id,user,new(entry.PlayerId,"Withdrawn")));
        }
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.UndoApprovalAsync(other.Id,entry.Id,t.OwnerUserId,new(entry.PlayerId)));
        Assert.Equal("APPROVED",entry.Status);Assert.Single(db.Players);
    }

    [Fact]
    public async Task AuctioneerCanUndoApproval()
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        var user=Guid.NewGuid();db.TournamentMembers.Add(new TournamentMember {TournamentId=t.Id,UserId=user,Role=TournamentRole.AUCTIONEER});await db.SaveChangesAsync();
        await service.UndoApprovalAsync(t.Id,entry.Id,user,new(entry.PlayerId));Assert.Equal("PENDING",entry.Status);Assert.Empty(db.Players);
    }

    [Fact]
    public async Task StaleApprovalRequestCannotRemoveAReapprovedPlayer()
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        var stale=new RegistrationApprovalChangeRequest(entry.PlayerId,"Withdrawn");
        await service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,stale);
        await Assert.ThrowsAsync<InvalidOperationException>(()=>service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,stale));
        await service.ReviewAsync(t.Id,entry.Id,t.OwnerUserId,Review(set));var current=entry.PlayerId;
        var error=await Assert.ThrowsAsync<InvalidOperationException>(()=>service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,stale));
        Assert.Contains("approval has changed",error.Message);Assert.Equal(current,Assert.Single(db.Players).Id);Assert.Equal("APPROVED",entry.Status);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RegistrationCanChangeAfterLinkedPlayerWasManuallyRemoved(bool reject)
    {
        var (db,service,_,_,t,set)=await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        await service.ReviewAsync(t.Id,request.SubmissionId,t.OwnerUserId,Review(set));var entry=db.PlayerRegistrations.Single();
        entry.PlayerId=null;db.Players.Remove(db.Players.Single());await db.SaveChangesAsync();
        if(reject) await service.RejectApprovedAsync(t.Id,entry.Id,t.OwnerUserId,new(null,"Withdrawn"));
        else await service.UndoApprovalAsync(t.Id,entry.Id,t.OwnerUserId,new(null));
        Assert.Equal(reject ? "REJECTED" : "PENDING",entry.Status);Assert.NotNull(entry.PhotoPath);Assert.Empty(db.Players);
    }
}
