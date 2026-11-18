using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Registrations;

namespace TournamentAuction.Tests;

public class RegistrationViewerTests
{
    private sealed class Photos : IRegistrationPhotoStorage
    {
        public bool Available => true;
        public int Reads;
        public Task<string> UploadAsync(Guid t, Guid r, IFormFile photo) => throw new NotSupportedException();
        public Task<string> ReviewUrlAsync(string path) { Reads++; return Task.FromResult($"https://photos.test/signed/{path}"); }
        public Task<string> PublishAsync(string path) => throw new NotSupportedException();
    }
    private static async Task<(TournamentAuctionDbContext db, RegistrationViewerService service, RegistrationViewerTokens tokens, Photos photos, Tournament tournament)> Fixture()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var tournament = new Tournament { Name="Organizer Cup",Slug="organizer-cup",OwnerUserId=Guid.NewGuid() };
        var tokens = new RegistrationViewerTokens(Encoding.UTF8.GetBytes("Registration-viewer-test-key-only-123456789"));
        var photos = new Photos();
        db.Tournaments.Add(tournament);
        foreach (var (index,status) in new[] { "PENDING","APPROVED","REJECTED" }.Index()) db.PlayerRegistrations.Add(new PlayerRegistration {
            Id=Guid.NewGuid(),TournamentId=tournament.Id,Name=$"Player {index}",Phone="919876543210",Email="private@example.test",Age=24,
            Position="Forward",PreferredFoot="Right",Status=status,PhotoPath=$"private/{index}.png",ReviewReason="Private review note",SubmittedAtUtc=DateTime.UtcNow.AddMinutes(index)
        });
        await db.SaveChangesAsync();
        return (db,new RegistrationViewerService(db,tokens,photos,TimeProvider.System),tokens,photos,tournament);
    }
    [Fact]
    public async Task OwnerGetsStableTournamentSpecificLinkWithoutChangingRegistrationSettings()
    {
        var (db,service,tokens,_,t) = await Fixture();
        var first = await service.GetLinkAsync(t.Id,t.OwnerUserId);
        Assert.Equal(first,await service.GetLinkAsync(t.Id,t.OwnerUserId));
        var restarted = new RegistrationViewerTokens(Encoding.UTF8.GetBytes("Registration-viewer-test-key-only-123456789"));
        Assert.Equal(tokens.ForTournament(t.Id),restarted.ForTournament(t.Id));
        Assert.EndsWith(tokens.ForTournament(t.Id),first.Path);
        Assert.StartsWith($"/registrations/{t.Slug}/view/",first.Path);
        Assert.False(tokens.IsValid(Guid.NewGuid(),tokens.ForTournament(t.Id)));
        Assert.Empty(db.RegistrationForms);
    }
    [Theory]
    [InlineData(TournamentRole.OWNER,true)]
    [InlineData(TournamentRole.AUCTIONEER,true)]
    [InlineData(TournamentRole.VIEWER,false)]
    public async Task OnlyRegistrationManagersCanObtainTheLink(TournamentRole role,bool allowed)
    {
        var (db,service,_,_,t) = await Fixture(); var user = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember {TournamentId=t.Id,UserId=user,Role=role}); await db.SaveChangesAsync();
        if (allowed) Assert.NotNull(await service.GetLinkAsync(t.Id,user));
        else await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.GetLinkAsync(t.Id,user));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.GetLinkAsync(t.Id,Guid.NewGuid()));
    }
    [Fact]
    public async Task ViewerListsAllRegistrationsAndNewArrivalsWithoutContactsOrPrivateNotes()
    {
        var (db,service,tokens,photos,t) = await Fixture(); var token = tokens.ForTournament(t.Id);
        var list = await service.ListAsync(t.Slug,token);
        Assert.Equal(t.Name,list.TournamentName); Assert.Equal(3,list.Players.Count);
        Assert.Equal(new[] {"REJECTED","APPROVED","PENDING"},list.Players.Select(p=>p.Status));
        Assert.All(list.Players,p=>Assert.True(p.HasPhoto)); Assert.Equal(0,photos.Reads);
        var json = JsonSerializer.Serialize(list);
        foreach (var secret in new[] {"Phone","Email","ReviewReason","ReviewedByUserId","PhotoPath","919876543210","private@example.test","Private review note","private/"}) Assert.DoesNotContain(secret,json);
        db.PlayerRegistrations.Add(new PlayerRegistration {Id=Guid.NewGuid(),TournamentId=t.Id,Name="New Arrival",Position="Goalkeeper"}); await db.SaveChangesAsync();
        Assert.Equal(4,(await service.ListAsync(t.Slug,token)).Players.Count);
        Assert.Equal(4,await db.PlayerRegistrations.CountAsync());
    }
    [Fact]
    public async Task MissingTamperedAndCrossTournamentTokensCannotReadTheListOrPhotos()
    {
        var (db,service,tokens,photos,t) = await Fixture(); var valid=tokens.ForTournament(t.Id);
        var other=new Tournament {Name="Other Cup",Slug="other-cup",OwnerUserId=t.OwnerUserId}; db.Tournaments.Add(other); await db.SaveChangesAsync();
        foreach(var token in new[] {"",valid[..63],new string('x',64),tokens.ForTournament(other.Id)}) {
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.ListAsync(t.Slug,token));
            await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.PhotoAsync(t.Slug,token,db.PlayerRegistrations.First().Id));
        }
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.ListAsync(other.Slug,valid));
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.ListAsync("missing",valid));
        Assert.Equal(0,photos.Reads);
    }
    [Fact]
    public async Task PhotosAreSignedOnlyForTheTournamentInTheViewingLink()
    {
        var (db,service,tokens,photos,t) = await Fixture(); var token=tokens.ForTournament(t.Id);
        var entry=db.PlayerRegistrations.First();
        Assert.StartsWith("https://photos.test/signed/",await service.PhotoAsync(t.Slug,token,entry.Id));
        var other=new PlayerRegistration {Id=Guid.NewGuid(),TournamentId=Guid.NewGuid(),Name="Other player",PhotoPath="other/private.png"}; db.PlayerRegistrations.Add(other); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.PhotoAsync(t.Slug,token,other.Id));
        entry.PhotoPath=null; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.PhotoAsync(t.Slug,token,entry.Id));
        Assert.Equal(1,photos.Reads);
    }
    [Fact]
    public void SharedEndpointsOnlySupportReadsAndLinkCreationRequiresSignIn()
    {
        var methods=typeof(RegistrationViewerController).GetMethods().Where(m=>m.DeclaringType==typeof(RegistrationViewerController));
        foreach(var method in methods) Assert.Single(method.GetCustomAttributes(typeof(HttpGetAttribute),true));
        Assert.Single(typeof(RegistrationViewerController).GetMethod("Link")!.GetCustomAttributes(typeof(AuthorizeAttribute),true));
        foreach(var name in new[] {"List","Photo"}) Assert.Single(typeof(RegistrationViewerController).GetMethod(name)!.GetCustomAttributes(typeof(AllowAnonymousAttribute),true));
    }
}
