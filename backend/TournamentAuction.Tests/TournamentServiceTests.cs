using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class TournamentServiceTests
{
    private (TournamentAuctionDbContext db, TournamentService service) CreateService(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var service = new TournamentService(db);
        return (db, service);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "user@test.com", string name = "Test User")
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            FullName = name,
            PasswordHash = "hash"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateTournament_AssignsCreatorAsOwnerAndGeneratesSlug()
    {
        var (db, service) = CreateService(nameof(CreateTournament_AssignsCreatorAsOwnerAndGeneratesSlug));
        var user = await SeedUserAsync(db);

        var req = new CreateTournamentRequest(
            Name: "Malabar Super League 2026",
            Season: "2026",
            Slug: null,
            Description: "Premier local tournament",
            LogoUrl: null,
            TournamentDate: DateTime.UtcNow.AddMonths(1),
            Location: "Calicut",
            TimeZone: "Asia/Kolkata"
        );

        var result = await service.CreateTournamentAsync(req, user.Id);

        Assert.NotNull(result);
        Assert.Equal("Malabar Super League 2026", result.Name);
        Assert.Equal("malabar-super-league-2026", result.Slug);
        Assert.Equal(TournamentRole.OWNER.ToString(), result.UserRole);
        Assert.Equal(user.Id, result.OwnerUserId);

        // Verify member in DB
        var membership = await db.TournamentMembers.FirstOrDefaultAsync(m => m.TournamentId == result.Id && m.UserId == user.Id);
        Assert.NotNull(membership);
        Assert.Equal(TournamentRole.OWNER, membership.Role);
    }

    [Fact]
    public async Task CreateTournament_DuplicateName_GeneratesUniqueSlugWithSuffix()
    {
        var (db, service) = CreateService(nameof(CreateTournament_DuplicateName_GeneratesUniqueSlugWithSuffix));
        var user = await SeedUserAsync(db);

        var req1 = new CreateTournamentRequest("Premier League", "2026", null, null, null, null, null, null);
        var res1 = await service.CreateTournamentAsync(req1, user.Id);

        var req2 = new CreateTournamentRequest("Premier League", "2026", null, null, null, null, null, null);
        var res2 = await service.CreateTournamentAsync(req2, user.Id);

        Assert.Equal("premier-league", res1.Slug);
        Assert.Equal("premier-league-1", res2.Slug);
    }

    [Fact]
    public async Task GetTournamentsForUser_ReturnsOnlyUserTournaments()
    {
        var (db, service) = CreateService(nameof(GetTournamentsForUser_ReturnsOnlyUserTournaments));
        var userA = await SeedUserAsync(db, "a@test.com", "User A");
        var userB = await SeedUserAsync(db, "b@test.com", "User B");

        await service.CreateTournamentAsync(new CreateTournamentRequest("Tournament A", "2026", null, null, null, null, null, null), userA.Id);
        await service.CreateTournamentAsync(new CreateTournamentRequest("Tournament B", "2026", null, null, null, null, null, null), userB.Id);

        var tournamentsA = await service.GetTournamentsForUserAsync(userA.Id);
        Assert.Single(tournamentsA);
        Assert.Equal("Tournament A", tournamentsA[0].Name);
    }

    [Fact]
    public async Task UpdateTournament_NonOwner_ThrowsUnauthorizedAccessException()
    {
        var (db, service) = CreateService(nameof(UpdateTournament_NonOwner_ThrowsUnauthorizedAccessException));
        var owner = await SeedUserAsync(db, "owner@test.com", "Owner");
        var nonOwner = await SeedUserAsync(db, "other@test.com", "Other");

        var created = await service.CreateTournamentAsync(new CreateTournamentRequest("Original Title", "2026", null, null, null, null, null, null), owner.Id);

        var updateReq = new UpdateTournamentRequest("Updated Title", "2026", null, null, null, null, null);

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.UpdateTournamentAsync(created.Id, updateReq, nonOwner.Id));
    }
}
