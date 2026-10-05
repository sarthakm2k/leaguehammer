using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Preflight;
using TournamentAuction.Api.Features.Teams;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class PreflightServiceTests
{
    private (TournamentAuctionDbContext db, TournamentPreflightService preflightService, TournamentService tournamentService, TeamService teamService, PlayerSetService setService, PlayerService playerService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var preflightService = new TournamentPreflightService(db);
        var tournamentService = new TournamentService(db);
        var teamService = new TeamService(db);
        var setService = new PlayerSetService(db);
        var playerService = new PlayerService(db);
        return (db, preflightService, tournamentService, teamService, setService, playerService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@preflight.com")
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = "Preflight Owner",
            PasswordHash = "hash"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task RunPreflight_LessThanTwoTeams_FailsWithCriticalError()
    {
        var (db, preflightService, tournamentService, teamService, setService, _) = CreateServices(nameof(RunPreflight_LessThanTwoTeams_FailsWithCriticalError));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Solo Team Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        // Only add 1 team
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Team One", "T1", null, "#000", null, null, 100000), user.Id);
        await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set 1", null, 1), user.Id);

        var report = await preflightService.RunPreflightAsync(tourn.Id, user.Id);

        Assert.False(report.IsReadyForAuction);
        Assert.Contains(report.BlockingErrors, e => e.Contains("At least 2 participating teams"));
    }

    [Fact]
    public async Task RunPreflight_InsufficientPlayersForMinSquad_FailsSquadFeasibility()
    {
        var (db, preflightService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(RunPreflight_InsufficientPlayersForMinSquad_FailsSquadFeasibility));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Shortfall Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        // Min squad is 12 by default. 2 teams require 24 players.
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Team A", "TA", null, "#000", null, null, 100000), user.Id);
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Team B", "TB", null, "#000", null, null, 100000), user.Id);
        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set 1", null, 1), user.Id);

        // Add only 5 players (shortfall of 19)
        for (int i = 1; i <= 5; i++)
        {
            await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest($"Player {i}", set.Id, 1000, null, null, null, null, null, null, null), user.Id);
        }

        var report = await preflightService.RunPreflightAsync(tourn.Id, user.Id);

        Assert.False(report.IsReadyForAuction);
        Assert.Contains(report.BlockingErrors, e => e.Contains("Mathematical Squad Shortfall"));
        Assert.Equal(24, report.Metrics.RequiredPlayersForMinSquad);
        Assert.Equal(5, report.Metrics.TotalPlayers);
    }

    [Fact]
    public async Task RunPreflight_TeamPurseBelowMinReserve_FailsPurseFeasibility()
    {
        var (db, preflightService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(RunPreflight_TeamPurseBelowMinReserve_FailsPurseFeasibility));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Poor Team Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        // Create teams initially valid
        var teamA = await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Broke FC", "BFC", null, "#000", null, null, 10000), user.Id);
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Rich FC", "RFC", null, "#000", null, null, 100000), user.Id);
        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set 1", null, 1), user.Id);

        // Adjust Team A's purse to 2,000 directly in db (below the 6,000 required reserve)
        var dbTeam = await db.Teams.FirstAsync(t => t.Id == teamA.Id);
        dbTeam.InitialPurse = 2000;
        await db.SaveChangesAsync();

        for (int i = 1; i <= 25; i++)
        {
            await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest($"Player {i}", set.Id, 500, null, null, null, null, null, null, null), user.Id);
        }

        var report = await preflightService.RunPreflightAsync(tourn.Id, user.Id);

        Assert.False(report.IsReadyForAuction);
        Assert.Contains(report.BlockingErrors, e => e.Contains("Insufficient starting purse"));
    }

    [Fact]
    public async Task RunPreflight_FullValidTournament_PassesAllChecksAndReady()
    {
        var (db, preflightService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(RunPreflight_FullValidTournament_PassesAllChecksAndReady));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Super League", "2026", null, null, null, null, null, null),
            user.Id
        );

        // Adjust settings so min squad = 3 to keep test concise
        var settings = await db.TournamentSettings.FirstAsync(s => s.TournamentId == tourn.Id);
        settings.MinimumSquadSize = 3;
        settings.MaximumSquadSize = 5;
        await db.SaveChangesAsync();

        // 2 teams x 3 players = 6 required players
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Team Red", "RED", null, "#f00", null, null, 50000), user.Id);
        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Team Blue", "BLU", null, "#00f", null, null, 50000), user.Id);

        var set = await setService.CreateSetAsync(tourn.Id, new CreatePlayerSetRequest("Set Alpha", null, 1), user.Id);

        // Add 8 players (8 >= 6)
        for (int i = 1; i <= 8; i++)
        {
            await playerService.CreatePlayerAsync(tourn.Id, new CreatePlayerRequest($"Star {i}", set.Id, 1000, "https://photo.url", 22, "Midfielder", "Right", i, null, null), user.Id);
        }

        var report = await preflightService.RunPreflightAsync(tourn.Id, user.Id);

        Assert.True(report.IsReadyForAuction);
        Assert.Equal(0, report.CriticalErrorsCount);
        Assert.Empty(report.BlockingErrors);

        // Approve ready for auction
        var approved = await preflightService.ApproveReadyForAuctionAsync(tourn.Id, user.Id);
        Assert.Equal("READY", approved.TournamentStatus);

        // Return to draft
        var reverted = await preflightService.ReturnToDraftAsync(tourn.Id, user.Id);
        Assert.Equal("DRAFT", reverted.TournamentStatus);
    }

    [Fact]
    public async Task ApproveReady_WhenPreflightFails_ThrowsInvalidOperationException()
    {
        var (db, preflightService, tournamentService, _, _, _) = CreateServices(nameof(ApproveReady_WhenPreflightFails_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Empty Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            preflightService.ApproveReadyForAuctionAsync(tourn.Id, user.Id)
        );
    }
}
