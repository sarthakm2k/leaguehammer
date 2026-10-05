using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.BasePriceTiers;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class BasePriceTierTests
{
    private (TournamentAuctionDbContext db, BasePriceTierService tierService, TournamentService tournamentService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var tierService = new BasePriceTierService(db);
        var tournamentService = new TournamentService(db);
        return (db, tierService, tournamentService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@tiertest.com")
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
    public async Task GetTiers_ReturnsDefaultSeededTiers()
    {
        var (db, tierService, tournamentService) = CreateServices(nameof(GetTiers_ReturnsDefaultSeededTiers));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Tier League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var tiers = await tierService.GetTiersAsync(tourn.Id, user.Id);

        Assert.Equal(5, tiers.Count);
        Assert.Contains(tiers, t => t.Amount == 500);
        Assert.Contains(tiers, t => t.Amount == 1000);
        Assert.Contains(tiers, t => t.Amount == 1500);
        Assert.Contains(tiers, t => t.Amount == 2000);
        Assert.Contains(tiers, t => t.Amount == 5000);
    }

    [Fact]
    public async Task CreateTier_Valid_AddsNewTier()
    {
        var (db, tierService, tournamentService) = CreateServices(nameof(CreateTier_Valid_AddsNewTier));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Tier League 2", "2026", null, null, null, null, null, null),
            user.Id
        );

        var newTier = await tierService.CreateTierAsync(
            tourn.Id,
            new CreateBasePriceTierRequest("₹10,000", 10000, 6),
            user.Id
        );

        Assert.Equal(10000, newTier.Amount);
        Assert.Equal("₹10,000", newTier.Label);

        var tiers = await tierService.GetTiersAsync(tourn.Id, user.Id);
        Assert.Equal(6, tiers.Count);
    }

    [Fact]
    public async Task CreateTier_DuplicateAmount_ThrowsInvalidOperationException()
    {
        var (db, tierService, tournamentService) = CreateServices(nameof(CreateTier_DuplicateAmount_ThrowsInvalidOperationException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Tier League 3", "2026", null, null, null, null, null, null),
            user.Id
        );

        // 500 already exists in default tiers
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            tierService.CreateTierAsync(
                tourn.Id,
                new CreateBasePriceTierRequest("Another ₹500", 500, 10),
                user.Id
            ));
    }
}
