using System.Text;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class CsvImportTests
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

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@csvtest.com")
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
    public async Task PreviewCsv_ValidData_ReturnsAllValidRows()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(PreviewCsv_ValidData_ReturnsAllValidRows));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("CSV Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Marquee Players", null, 1), user.Id);
        await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Midfielders", null, 2), user.Id);

        var csvContent = @"Name,Set,BasePrice,Position,Age,PreferredFoot,PreviousTeam,JerseyNumber
Arjun Nair,Marquee Players,5000,Forward,24,Right,Malabar United,10
Mohammed Ashif,Midfielders,2000,Midfielder,22,Left,Calicut FC,8";

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csvContent));
        var preview = await playerService.PreviewCsvAsync(tourn.Id, stream, user.Id);

        Assert.Equal(2, preview.TotalRows);
        Assert.Equal(2, preview.ValidRowsCount);
        Assert.Equal(0, preview.InvalidRowsCount);
        Assert.True(preview.Rows[0].IsValid);
        Assert.True(preview.Rows[1].IsValid);
        Assert.NotNull(preview.Rows[0].ResolvedPlayerSetId);
    }

    [Fact]
    public async Task PreviewCsv_NonExistentSet_FlagsInvalidRow()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(PreviewCsv_NonExistentSet_FlagsInvalidRow));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("CSV Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Goalkeepers", null, 1), user.Id);

        var csvContent = @"Name,Set,BasePrice,Position
Valid Keeper,Goalkeepers,1000,Goalkeeper
Invalid Striker,UnknownSet,2000,Forward";

        using var stream = new MemoryStream(Encoding.UTF8.GetBytes(csvContent));
        var preview = await playerService.PreviewCsvAsync(tourn.Id, stream, user.Id);

        Assert.Equal(2, preview.TotalRows);
        Assert.Equal(1, preview.ValidRowsCount);
        Assert.Equal(1, preview.InvalidRowsCount);

        var invalidRow = preview.Rows.First(r => !r.IsValid);
        Assert.Equal("Invalid Striker", invalidRow.Name);
        Assert.Contains(invalidRow.ValidationErrors, e => e.Contains("UnknownSet"));
    }

    [Fact]
    public async Task ImportCsv_InsertsValidPlayers()
    {
        var (db, playerService, setService, tournamentService) = CreateServices(nameof(ImportCsv_InsertsValidPlayers));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("CSV Tourney", "2026", null, null, null, null, null, null),
            user.Id
        );

        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Defenders", null, 1), user.Id);

        var rows = new List<CsvPlayerRowDto>
        {
            new CsvPlayerRowDto(1, "Player Alpha", "Defenders", 1500, "Defender", 25, "Right", null, 4, true, new List<string>(), set.Id),
            new CsvPlayerRowDto(2, "Player Beta", "Defenders", 2000, "Defender", 28, "Left", null, 5, true, new List<string>(), set.Id)
        };

        var result = await playerService.ImportCsvAsync(tourn.Id, new CsvImportCommitRequest(rows), user.Id);

        Assert.Equal(2, result.ImportedCount);
        Assert.Equal(0, result.SkippedCount);

        var players = await playerService.GetPlayersAsync(tourn.Id, new PlayerFilterRequest(), user.Id);
        Assert.Equal(2, players.TotalCount);
    }

    [Fact]
    public void GenerateCsvTemplate_ReturnsValidCsvBytes()
    {
        var (db, playerService, _, _) = CreateServices(nameof(GenerateCsvTemplate_ReturnsValidCsvBytes));
        var bytes = playerService.GenerateCsvTemplate();
        var content = Encoding.UTF8.GetString(bytes);

        Assert.Contains("Name,Set,BasePrice", content);
        Assert.Contains("Arjun Nair", content);
    }
}
