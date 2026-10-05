using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Teams;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class TeamServiceTests
{
    private (TournamentAuctionDbContext db, TeamService teamService, TournamentService tournamentService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var teamService = new TeamService(db);
        var tournamentService = new TournamentService(db);
        return (db, teamService, tournamentService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@teamtest.com")
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
    public async Task CreateTeam_DefaultPurse_InheritsTournamentStartingPurse()
    {
        var (db, teamService, tournamentService) = CreateServices(nameof(CreateTeam_DefaultPurse_InheritsTournamentStartingPurse));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Super Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        var teamReq = new CreateTeamRequest(
            Name: "Falcons FC",
            ShortName: "FLC",
            LogoUrl: null,
            PrimaryColor: "#10B981",
            SecondaryColor: "#047857",
            OwnerName: "Jamal",
            InitialPurse: null // Should default to 100,000
        );

        var team = await teamService.CreateTeamAsync(tourn.Id, teamReq, user.Id);

        Assert.NotNull(team);
        Assert.Equal("Falcons FC", team.Name);
        Assert.Equal("FLC", team.ShortName);
        Assert.Equal(100000, team.InitialPurse);
    }

    [Fact]
    public async Task CreateTeam_DuplicateName_ThrowsInvalidOperationException()
    {
        var (db, teamService, tournamentService) = CreateServices(nameof(CreateTeam_DuplicateName_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Cup A", "2026", null, null, null, null, null, null),
            user.Id
        );

        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Warriors FC", "WAR", null, null, null, null, null), user.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("warriors fc", "WRS", null, null, null, null, null), user.Id));
    }

    [Fact]
    public async Task CreateTeam_DuplicateShortName_ThrowsInvalidOperationException()
    {
        var (db, teamService, tournamentService) = CreateServices(nameof(CreateTeam_DuplicateShortName_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Cup B", "2026", null, null, null, null, null, null),
            user.Id
        );

        await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("United XI", "UTD", null, null, null, null, null), user.Id);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("United Stars", "utd", null, null, null, null, null), user.Id));
    }

    [Fact]
    public async Task DeleteTeam_DraftStatus_SuccessfullyRemovesTeam()
    {
        var (db, teamService, tournamentService) = CreateServices(nameof(DeleteTeam_DraftStatus_SuccessfullyRemovesTeam));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Cup C", "2026", null, null, null, null, null, null),
            user.Id
        );

        var team = await teamService.CreateTeamAsync(tourn.Id, new CreateTeamRequest("Thunder FC", "THN", null, null, null, null, null), user.Id);

        var listBefore = await teamService.GetTeamsAsync(tourn.Id, user.Id);
        Assert.Single(listBefore);

        await teamService.DeleteTeamAsync(tourn.Id, team.Id, user.Id);

        var listAfter = await teamService.GetTeamsAsync(tourn.Id, user.Id);
        Assert.Empty(listAfter);
    }
}
