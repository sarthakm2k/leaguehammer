using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public partial class TournamentServiceTests
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

    [Theory]
    [InlineData(TournamentRole.AUCTIONEER)]
    [InlineData(TournamentRole.VIEWER)]
    public async Task DeleteTournament_RejectsOtherMembersAndOutsiders(TournamentRole role)
    {
        var (db, service) = CreateService($"{nameof(DeleteTournament_RejectsOtherMembersAndOutsiders)}-{role}");
        var owner = await SeedUserAsync(db);
        var other = await SeedUserAsync(db, "other@test.com");
        var created = await service.CreateTournamentAsync(new("Delete Cup", "2026", null, null, null, null, null, null), owner.Id);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.DeleteTournamentAsync(created.Id, other.Id));
        db.TournamentMembers.Add(new() { TournamentId = created.Id, UserId = other.Id, Role = role });
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.DeleteTournamentAsync(created.Id, other.Id));
        Assert.True(await db.Tournaments.AnyAsync(t => t.Id == created.Id));
    }

    [Theory]
    [InlineData(AuctionSessionStatus.LIVE)]
    [InlineData(AuctionSessionStatus.PAUSED)]
    public async Task DeleteTournament_ProtectsActiveSessions(AuctionSessionStatus status)
    {
        var (db, service) = CreateService($"{nameof(DeleteTournament_ProtectsActiveSessions)}-{status}");
        var owner = await SeedUserAsync(db);
        var created = await service.CreateTournamentAsync(new("Active Cup", "2026", null, null, null, null, null, null), owner.Id);
        db.AuctionSessions.Add(new() { TournamentId = created.Id, Status = status });
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.DeleteTournamentAsync(created.Id, owner.Id));
        Assert.True(await db.TournamentSettings.AnyAsync(s => s.TournamentId == created.Id));
    }

    [Fact]
    public async Task DeleteTournament_ProtectsLiveTournamentWithoutSession()
    {
        var (db, service) = CreateService(nameof(DeleteTournament_ProtectsLiveTournamentWithoutSession));
        var owner = await SeedUserAsync(db);
        var created = await service.CreateTournamentAsync(new("Live Cup", "2026", null, null, null, null, null, null), owner.Id);
        (await db.Tournaments.FindAsync(created.Id))!.Status = TournamentStatus.LIVE;
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.DeleteTournamentAsync(created.Id, owner.Id));
        Assert.True(await db.Tournaments.AnyAsync(t => t.Id == created.Id));
    }

    [Theory]
    [InlineData(TournamentStatus.DRAFT)]
    [InlineData(TournamentStatus.READY)]
    [InlineData(TournamentStatus.COMPLETED)]
    public async Task DeleteTournament_RemovesAllRelatedRecordsAndPreservesOtherTournaments(TournamentStatus status)
    {
        var (db, service) = CreateService($"{nameof(DeleteTournament_RemovesAllRelatedRecordsAndPreservesOtherTournaments)}-{status}");
        var owner = await SeedUserAsync(db);
        var created = await service.CreateTournamentAsync(new("Delete Cup", "2026", null, null, null, null, null, null), owner.Id);
        var kept = await service.CreateTournamentAsync(new("Keep Cup", "2026", null, null, null, null, null, null), owner.Id);
        (await db.Tournaments.FindAsync(created.Id))!.Status = status;
        var set = new PlayerSet { TournamentId = created.Id, Name = "Forwards" };
        var player = new Player { TournamentId = created.Id, PlayerSetId = set.Id, Name = "Player" };
        var team = new Team { TournamentId = created.Id, Name = "Team", ShortName = "T" };
        var session = new AuctionSession { TournamentId = created.Id, Status = AuctionSessionStatus.COMPLETED, CurrentSetId = set.Id };
        var lot = new AuctionLot { TournamentId = created.Id, AuctionSessionId = session.Id, PlayerId = player.Id, PlayerSetId = set.Id, WinningTeamId = team.Id, Status = AuctionLotStatus.SOLD };
        db.AddRange(set, player, team, session, lot);
        db.AuctionEvents.Add(new() { TournamentId = created.Id, AuctionSessionId = session.Id, AuctionLotId = lot.Id, UserId = owner.Id, EventType = "PLAYER_SOLD" });
        db.RegistrationForms.Add(new() { TournamentId = created.Id, Enabled = true });
        db.PlayerRegistrations.Add(new() { Id = Guid.NewGuid(), TournamentId = created.Id, Name = "Registration", PlayerId = player.Id });
        await db.SaveChangesAsync();
        session.CurrentLotId = lot.Id;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        await service.DeleteTournamentAsync(created.Id, owner.Id);

        Assert.False(await db.Tournaments.AnyAsync(t => t.Id == created.Id));
        Assert.Empty(await db.AuctionLots.ToListAsync());
        Assert.Empty(await db.AuctionEvents.ToListAsync());
        Assert.Empty(await db.AuctionSessions.ToListAsync());
        Assert.Empty(await db.Players.ToListAsync());
        Assert.Empty(await db.PlayerSets.ToListAsync());
        Assert.Empty(await db.Teams.ToListAsync());
        Assert.Empty(await db.PlayerRegistrations.ToListAsync());
        Assert.Empty(await db.RegistrationForms.ToListAsync());
        Assert.False(await db.TournamentMembers.AnyAsync(m => m.TournamentId == created.Id));
        Assert.False(await db.TournamentSettings.AnyAsync(s => s.TournamentId == created.Id));
        Assert.False(await db.BasePriceTiers.AnyAsync(t => t.TournamentId == created.Id));
        Assert.True(await db.Tournaments.AnyAsync(t => t.Id == kept.Id));
        Assert.True(await db.TournamentSettings.AnyAsync(s => s.TournamentId == kept.Id));
        Assert.Equal(5, await db.BasePriceTiers.CountAsync(t => t.TournamentId == kept.Id));
        Assert.True(await db.Users.AnyAsync(u => u.Id == owner.Id));
    }
}
