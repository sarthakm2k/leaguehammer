using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class PlayerSetTests
{
    private (TournamentAuctionDbContext db, PlayerSetService setService, TournamentService tournamentService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var setService = new PlayerSetService(db);
        var tournamentService = new TournamentService(db);
        return (db, setService, tournamentService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@settest.com")
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Owner",
            PasswordHash = "hash"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateSet_Valid_AddsPlayerSet()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(CreateSet_Valid_AddsPlayerSet));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var created = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Marquee Players", "Top stars", 1),
            user.Id
        );

        Assert.Equal("Marquee Players", created.Name);
        Assert.Equal("Top stars", created.Description);
        Assert.Equal(1, created.SortOrder);
        Assert.Equal(0, created.PlayerCount);

        var sets = await setService.GetSetsAsync(tourn.Id, user.Id);
        Assert.Single(sets);
    }

    [Fact]
    public async Task CreateSet_DuplicateName_ThrowsInvalidOperationException()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(CreateSet_DuplicateName_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Defenders", null, 1),
            user.Id
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            setService.CreateSetAsync(
                tourn.Id,
                new CreatePlayerSetRequest("defenders", null, 2),
                user.Id
            )
        );
    }

    [Fact]
    public async Task UpdateSet_Valid_UpdatesNameAndOrder()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(UpdateSet_Valid_UpdatesNameAndOrder));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Initial Set", null, 1),
            user.Id
        );

        var updated = await setService.UpdateSetAsync(
            tourn.Id,
            set.Id,
            new UpdatePlayerSetRequest("Updated Set", "Updated Desc", 5),
            user.Id
        );

        Assert.Equal("Updated Set", updated.Name);
        Assert.Equal("Updated Desc", updated.Description);
        Assert.Equal(5, updated.SortOrder);
    }

    [Fact]
    public async Task DeleteSet_WithoutPlayers_RemovesSet()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(DeleteSet_WithoutPlayers_RemovesSet));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Strikers", null, 1),
            user.Id
        );

        await setService.DeleteSetAsync(tourn.Id, set.Id, user.Id);

        var sets = await setService.GetSetsAsync(tourn.Id, user.Id);
        Assert.Empty(sets);
    }

    [Fact]
    public async Task DeleteSet_WithPlayers_ThrowsInvalidOperationException()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(DeleteSet_WithPlayers_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Midfielders", null, 1),
            user.Id
        );

        // Add a player to the set
        db.Players.Add(new Player
        {
            Id = Guid.NewGuid(),
            TournamentId = tourn.Id,
            PlayerSetId = set.Id,
            Name = "Player 1",
            BasePrice = 1000,
            Status = "AVAILABLE"
        });
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            setService.DeleteSetAsync(tourn.Id, set.Id, user.Id)
        );
    }

    [Fact]
    public async Task ReorderSets_UpdatesSortOrdersCorrectly()
    {
        var (db, setService, tournamentService) = CreateServices(nameof(ReorderSets_UpdatesSortOrdersCorrectly));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Set League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var setA = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set A", null, 1), user.Id);
        var setB = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set B", null, 2), user.Id);
        var setC = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set C", null, 3), user.Id);

        // Reverse order: C, B, A
        await setService.ReorderSetsAsync(tourn.Id, new ReorderPlayerSetsRequest(new List<Guid> { setC.Id, setB.Id, setA.Id }), user.Id);

        var reordered = await setService.GetSetsAsync(tourn.Id, user.Id);
        Assert.Equal("Set C", reordered[0].Name);
        Assert.Equal(1, reordered[0].SortOrder);
        Assert.Equal("Set B", reordered[1].Name);
        Assert.Equal(2, reordered[1].SortOrder);
        Assert.Equal("Set A", reordered[2].Name);
        Assert.Equal(3, reordered[2].SortOrder);
    }
}
