using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Teams;

namespace TournamentAuction.Tests;

public class TeamLogoTests
{
    private sealed class Storage : ITeamLogoStorage
    {
        public int Calls;
        public bool Fail;
        public Task<string> UploadLogoAsync(Guid tournamentId, Guid teamId, IFormFile logo)
        {
            Calls++;
            if (Fail) throw new HttpRequestException("Storage unavailable");
            return Task.FromResult("https://storage.example/team-logo.png");
        }
    }
    private static IFormFile Logo() => new FormFile(new MemoryStream([1]), 0, 1, "logo", "logo.png");
    private static (TournamentAuctionDbContext db, Team team, Guid owner) Seed()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = Guid.NewGuid();
        var tournament = new Tournament { OwnerUserId = owner, Status = TournamentStatus.LIVE };
        var team = new Team { TournamentId = tournament.Id, Name = "Falcons", ShortName = "FLC", InitialPurse = 10000, LogoUrl = "https://storage.example/original.png" };
        db.Tournaments.Add(tournament);
        db.Teams.Add(team);
        db.TournamentMembers.Add(new TournamentMember { TournamentId = tournament.Id, UserId = owner, Role = TournamentRole.OWNER });
        db.SaveChanges();
        return (db, team, owner);
    }
    [Fact]
    public async Task OwnerCanUpdateBrandingDuringLiveAuctionWithoutChangingPurseOrIdentity()
    {
        var (db, team, owner) = Seed(); var storage = new Storage();
        var url = await new TeamLogoService(db, storage).UploadAsync(team.TournamentId, team.Id, owner, Logo());
        Assert.Equal(url, team.LogoUrl); Assert.Equal(10000, team.InitialPurse); Assert.Equal("Falcons", team.Name);
        Assert.Equal(TournamentStatus.LIVE, db.Tournaments.Single().Status); Assert.Equal(1, storage.Calls);
    }
    [Theory]
    [InlineData(TournamentRole.VIEWER)]
    [InlineData(TournamentRole.AUCTIONEER)]
    public async Task NonOwnersCannotWriteToStorage(TournamentRole role)
    {
        var (db, team, _) = Seed(); var storage = new Storage(); var other = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember { TournamentId = team.TournamentId, UserId = other, Role = role }); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new TeamLogoService(db, storage).UploadAsync(team.TournamentId, team.Id, other, Logo()));
        Assert.Equal(0, storage.Calls);
    }
    [Fact]
    public async Task CrossTournamentTeamCannotBeChanged()
    {
        var (db, team, owner) = Seed(); var storage = new Storage(); var another = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember { TournamentId = another, UserId = owner, Role = TournamentRole.OWNER }); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(() => new TeamLogoService(db, storage).UploadAsync(another, team.Id, owner, Logo()));
        Assert.Equal(0, storage.Calls);
    }
    [Fact]
    public async Task StorageFailurePreservesExistingLogo()
    {
        var (db, team, owner) = Seed(); var storage = new Storage { Fail = true };
        await Assert.ThrowsAsync<HttpRequestException>(() => new TeamLogoService(db, storage).UploadAsync(team.TournamentId, team.Id, owner, Logo()));
        Assert.Equal("https://storage.example/original.png", team.LogoUrl);
    }
}
