using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Settings;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class TournamentSettingsTests
{
    private (TournamentAuctionDbContext db, TournamentSettingsService settingsService, TournamentService tournamentService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var settingsService = new TournamentSettingsService(db);
        var tournamentService = new TournamentService(db);
        return (db, settingsService, tournamentService);
    }

    private async Task<User> SeedUserAsync(TournamentAuctionDbContext db, string email = "owner@test.com")
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
    public async Task GetSettings_ReturnsDefaultSettings()
    {
        var (db, settingsService, tournamentService) = CreateServices(nameof(GetSettings_ReturnsDefaultSettings));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Premier League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var settings = await settingsService.GetSettingsAsync(tourn.Id, user.Id);

        Assert.NotNull(settings);
        Assert.Equal("INR", settings.CurrencyCode);
        Assert.Equal(100000, settings.DefaultStartingPurse);
        Assert.Equal(12, settings.MinimumSquadSize);
        Assert.Equal(16, settings.MaximumSquadSize);
        Assert.Equal(500, settings.MinimumAcquisitionPrice);
        Assert.Equal(100, settings.DefaultBidIncrement);
    }

    [Fact]
    public async Task UpdateSettings_ValidRequest_UpdatesSettings()
    {
        var (db, settingsService, tournamentService) = CreateServices(nameof(UpdateSettings_ValidRequest_UpdatesSettings));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Super League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var updateReq = new UpdateTournamentSettingsRequest(
            CurrencyCode: "INR",
            CurrencySymbol: "₹",
            DefaultStartingPurse: 200000,
            MinimumSquadSize: 14,
            MaximumSquadSize: 18,
            MinimumAcquisitionPrice: 1000,
            DefaultBidIncrement: 200,
            PublicLiveViewEnabled: true
        );

        var updated = await settingsService.UpdateSettingsAsync(tourn.Id, updateReq, user.Id);

        Assert.Equal(200000, updated.DefaultStartingPurse);
        Assert.Equal(14, updated.MinimumSquadSize);
        Assert.Equal(18, updated.MaximumSquadSize);
        Assert.Equal(1000, updated.MinimumAcquisitionPrice);
        Assert.Equal(200, updated.DefaultBidIncrement);
    }

    [Fact]
    public async Task UpdateSettings_MaxSquadLessThanMinSquad_ThrowsArgumentException()
    {
        var (db, settingsService, tournamentService) = CreateServices(nameof(UpdateSettings_MaxSquadLessThanMinSquad_ThrowsArgumentException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Cup", "2026", null, null, null, null, null, null),
            user.Id
        );

        var updateReq = new UpdateTournamentSettingsRequest(
            CurrencyCode: "INR",
            CurrencySymbol: "₹",
            DefaultStartingPurse: 100000,
            MinimumSquadSize: 15,
            MaximumSquadSize: 10, // Invalid!
            MinimumAcquisitionPrice: 500,
            DefaultBidIncrement: 100,
            PublicLiveViewEnabled: true
        );

        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateSettingsAsync(tourn.Id, updateReq, user.Id));
    }

    [Fact]
    public async Task UpdateSettings_PurseLessThanMinSquadReserve_ThrowsArgumentException()
    {
        var (db, settingsService, tournamentService) = CreateServices(nameof(UpdateSettings_PurseLessThanMinSquadReserve_ThrowsArgumentException));
        var user = await SeedUserAsync(db);

        var tourn = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Cup 2", "2026", null, null, null, null, null, null),
            user.Id
        );

        // 12 players * ₹10,000 = ₹120,000 required reserve, but starting purse is only ₹50,000
        var updateReq = new UpdateTournamentSettingsRequest(
            CurrencyCode: "INR",
            CurrencySymbol: "₹",
            DefaultStartingPurse: 50000,
            MinimumSquadSize: 12,
            MaximumSquadSize: 16,
            MinimumAcquisitionPrice: 10000,
            DefaultBidIncrement: 100,
            PublicLiveViewEnabled: true
        );

        await Assert.ThrowsAsync<ArgumentException>(() =>
            settingsService.UpdateSettingsAsync(tourn.Id, updateReq, user.Id));
    }
}
