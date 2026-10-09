using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Players;

namespace TournamentAuction.Tests;

public class PlayerPhotoTests
{
    private sealed class Storage : IPlayerPhotoStorage
    {
        public int Calls;
        public bool Fail;
        public Task<string> UploadPlayerPhotoAsync(Guid tournamentId, Guid teamId, IFormFile logo)
        {
            Calls++;
            if (Fail) throw new HttpRequestException("Storage unavailable");
            return Task.FromResult("https://storage.example/team-logo.png");
        }
    }
    private static IFormFile Logo() => new FormFile(new MemoryStream([1]), 0, 1, "logo", "logo.png");
    private static (TournamentAuctionDbContext db, Player team, Guid owner) Seed()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = Guid.NewGuid();
        var tournament = new Tournament { OwnerUserId = owner, Status = TournamentStatus.LIVE };
        var team = new Player { TournamentId = tournament.Id, Name = "Falcons", BasePrice = 10000, PhotoUrl = "https://storage.example/original.png", Status = "SOLD" };
        db.Tournaments.Add(tournament);
        db.Players.Add(team);
        db.TournamentMembers.Add(new TournamentMember { TournamentId = tournament.Id, UserId = owner, Role = TournamentRole.OWNER });
        db.SaveChanges();
        return (db, team, owner);
    }
    [Fact]
    public async Task OwnerCanUpdateLivePlayerPhotoWithoutChangingAuctionFields()
    {
        var (db, team, owner) = Seed(); var storage = new Storage();
        var url = await new PlayerPhotoService(db, storage).UploadAsync(team.TournamentId, team.Id, owner, Logo());
        Assert.Equal(url, team.PhotoUrl); Assert.Equal(10000, team.BasePrice); Assert.Equal("Falcons", team.Name);
        Assert.Equal(TournamentStatus.LIVE, db.Tournaments.Single().Status); Assert.Equal(1, storage.Calls); Assert.Equal("SOLD", team.Status);
    }
    [Theory]
    [InlineData(TournamentRole.VIEWER)]
    [InlineData(TournamentRole.AUCTIONEER)]
    public async Task NonOwnersCannotWriteToStorage(TournamentRole role)
    {
        var (db, team, _) = Seed(); var storage = new Storage(); var other = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember { TournamentId = team.TournamentId, UserId = other, Role = role }); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new PlayerPhotoService(db, storage).UploadAsync(team.TournamentId, team.Id, other, Logo()));
        Assert.Equal(0, storage.Calls);
    }
    [Fact]
    public async Task CrossTournamentPlayerCannotBeChanged()
    {
        var (db, team, owner) = Seed(); var storage = new Storage(); var another = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember { TournamentId = another, UserId = owner, Role = TournamentRole.OWNER }); await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(() => new PlayerPhotoService(db, storage).UploadAsync(another, team.Id, owner, Logo()));
        Assert.Equal(0, storage.Calls);
    }
    [Fact]
    public async Task StorageFailurePreservesExistingPhoto()
    {
        var (db, team, owner) = Seed(); var storage = new Storage { Fail = true };
        await Assert.ThrowsAsync<HttpRequestException>(() => new PlayerPhotoService(db, storage).UploadAsync(team.TournamentId, team.Id, owner, Logo()));
        Assert.Equal("https://storage.example/original.png", team.PhotoUrl);
    }

    [Fact]
    public async Task RemovingPhotoPreservesCloneAndDoesNotRequireStorage()
    {
        var (db, player, owner) = Seed(); var storage = new Storage { Fail = true };
        var clone = new Player { TournamentId = Guid.NewGuid(), Name = "Clone", PhotoUrl = player.PhotoUrl };
        db.Players.Add(clone); await db.SaveChangesAsync();
        await new PlayerPhotoService(db, storage).RemoveAsync(player.TournamentId, player.Id, owner);
        Assert.Null(player.PhotoUrl); Assert.Equal("https://storage.example/original.png", clone.PhotoUrl); Assert.Equal(0, storage.Calls);
    }
    [Fact]
    public async Task NonOwnerCannotRemovePhoto()
    {
        var (db, player, _) = Seed(); var storage = new Storage();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => new PlayerPhotoService(db, storage).RemoveAsync(player.TournamentId, player.Id, Guid.NewGuid()));
        Assert.NotNull(player.PhotoUrl);
    }
}
