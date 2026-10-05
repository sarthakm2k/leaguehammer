using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class PlayerServiceTests
{
    private (TournamentAuctionDbContext db, PlayerService playerService, PlayerSetService setService, TournamentService tournamentService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var playerService = new PlayerService(db);
        var setService = new PlayerSetService(db);
        var tournamentService = new TournamentService(db);
        return (db, playerService, setService, tournamentService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@playertest.com")
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
    public async Task CreatePlayer_Valid_AddsPlayerWithSet()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(CreatePlayer_Valid_AddsPlayerWithSet));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Player Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Forwards", null, 1),
            user.Id
        );

        var player = await playerService.CreatePlayerAsync(
            tourn.Id,
            new CreatePlayerRequest(
                Name: "Arjun Nair",
                PlayerSetId: set.Id,
                BasePrice: 2000,
                PhotoUrl: null,
                Age: 24,
                Position: "Forward",
                PreferredFoot: "Right",
                JerseyNumber: 10,
                PreviousTeam: "Malabar FC",
                ShortBio: "Proven goal scorer"
            ),
            user.Id
        );

        Assert.Equal("Arjun Nair", player.Name);
        Assert.Equal(set.Id, player.PlayerSetId);
        Assert.Equal("Forwards", player.PlayerSetName);
        Assert.Equal(2000, player.BasePrice);
        Assert.Equal("Forward", player.Position);
        Assert.Equal("AVAILABLE", player.Status);
    }

    [Fact]
    public async Task CreatePlayer_BelowMinimumAcquisitionPrice_ThrowsInvalidOperationException()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(CreatePlayer_BelowMinimumAcquisitionPrice_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Player Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(
            tourn.Id,
            new CreatePlayerSetRequest("Goalkeepers", null, 1),
            user.Id
        );

        // Minimum acquisition price is 500 by default; attempting 100 should throw
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            playerService.CreatePlayerAsync(
                tourn.Id,
                new CreatePlayerRequest(
                    Name: "Discount Player",
                    PlayerSetId: set.Id,
                    BasePrice: 100, // < 500
                    PhotoUrl: null,
                    Age: null,
                    Position: null,
                    PreferredFoot: null,
                    JerseyNumber: null,
                    PreviousTeam: null,
                    ShortBio: null
                ),
                user.Id
            )
        );
    }

    [Fact]
    public async Task GetPlayers_WithFilters_ReturnsFilteredResults()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(GetPlayers_WithFilters_ReturnsFilteredResults));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Player Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set1 = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Attack", null, 1), user.Id);
        var set2 = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Defense", null, 2), user.Id);

        await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest("Cristiano", set1.Id, 5000, null, 39, "Forward", "Right", 7, null, null), user.Id);
        await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest("Messi", set1.Id, 5000, null, 37, "Forward", "Left", 10, null, null), user.Id);
        await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest("Van Dijk", set2.Id, 3000, null, 33, "Defender", "Right", 4, null, null), user.Id);

        // Search for "Messi"
        var searchResult = await playerService.GetPlayersAsync(tourn.Id, new PlayerFilterRequest(Search: "messi"), user.Id);
        Assert.Single(searchResult.Items);
        Assert.Equal("Messi", searchResult.Items[0].Name);

        // Filter by Set 2 (Defense)
        var set2Result = await playerService.GetPlayersAsync(tourn.Id, new PlayerFilterRequest(PlayerSetId: set2.Id), user.Id);
        Assert.Single(set2Result.Items);
        Assert.Equal("Van Dijk", set2Result.Items[0].Name);

        // Filter by Position "Forward"
        var forwardResult = await playerService.GetPlayersAsync(tourn.Id, new PlayerFilterRequest(Position: "forward"), user.Id);
        Assert.Equal(2, forwardResult.Items.Count);
    }

    [Fact]
    public async Task UpdatePlayer_Valid_UpdatesFields()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(UpdatePlayer_Valid_UpdatesFields));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Player Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set 1", null, 1), user.Id);

        var player = await playerService.CreatePlayerAsync(
            tourn.Id,
            new CreatePlayerRequest("Initial Name", set.Id, 1000, null, 20, "Forward", null, null, null, null),
            user.Id
        );

        var updated = await playerService.UpdatePlayerAsync(
            tourn.Id,
            player.Id,
            new UpdatePlayerRequest("Updated Name", set.Id, 2500, null, 21, "Midfielder", "Left", 8, "Kerala Blasters", "Rising talent"),
            user.Id
        );

        Assert.Equal("Updated Name", updated.Name);
        Assert.Equal(2500, updated.BasePrice);
        Assert.Equal("Midfielder", updated.Position);
        Assert.Equal("Left", updated.PreferredFoot);
        Assert.Equal(8, updated.JerseyNumber);
    }

    [Fact]
    public async Task DeletePlayer_RemovesPlayer()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(DeletePlayer_RemovesPlayer));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Player Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set 1", null, 1), user.Id);
        var player = await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest("To Delete", set.Id, 1000, null, null, null, null, null, null, null), user.Id);

        await playerService.DeletePlayerAsync(tourn.Id, player.Id, user.Id);

        var result = await playerService.GetPlayersAsync(tourn.Id, new PlayerFilterRequest(), user.Id);
        Assert.Empty(result.Items);
    }
}
