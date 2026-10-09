using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Tournaments;

namespace TournamentAuction.Tests;

public partial class TournamentServiceTests
{
    [Theory]
    [InlineData(TournamentStatus.DRAFT)]
    [InlineData(TournamentStatus.READY)]
    [InlineData(TournamentStatus.LIVE)]
    [InlineData(TournamentStatus.COMPLETED)]
    public async Task CloneTournament_CopiesSetupResetsAuctionAndIsolatesSource(TournamentStatus sourceStatus)
    {
        var (db, service) = CreateService($"{nameof(CloneTournament_CopiesSetupResetsAuctionAndIsolatesSource)}-{sourceStatus}");
        var owner = await SeedUserAsync(db);
        var other = await SeedUserAsync(db, "auctioneer@test.com");
        var source = await service.CreateTournamentAsync(new("Original Cup", "2026", null, "Tournament description", "https://example.test/logo.png", DateTime.UtcNow.AddDays(1), "Kochi", "Asia/Kolkata"), owner.Id);
        (await db.Tournaments.FindAsync(source.Id))!.Status = sourceStatus;
        var settings = await db.TournamentSettings.SingleAsync(s => s.TournamentId == source.Id);
        settings.CurrencyCode = "USD"; settings.CurrencySymbol = "$"; settings.DefaultStartingPurse = 50000;
        settings.MinimumSquadSize = 1; settings.MaximumSquadSize = 6;
        settings.MinimumAcquisitionPrice = 100; settings.DefaultBidIncrement = 200;
        settings.PublicLiveViewEnabled = false; settings.SellAllPlayers = true;
        var team = new Team { TournamentId = source.Id, Name = "Falcons", ShortName = "FLC", InitialPurse = 75000,
            LogoUrl = "https://example.test/team.png", PrimaryColor = "#123456", SecondaryColor = "#abcdef", OwnerName = "Club owner" };
        var firstSet = new PlayerSet { TournamentId = source.Id, Name = "Forwards", Description = "First set", SortOrder = 2 };
        var secondSet = new PlayerSet { TournamentId = source.Id, Name = "Keepers", SortOrder = 4 };
        db.AddRange(team, firstSet, secondSet);
        var players = new[] { "AVAILABLE", "ON_AUCTION", "SOLD", "UNSOLD", "FINAL_UNSOLD" }.Select((status, i) => new Player
        {
            TournamentId = source.Id, PlayerSetId = i == 4 ? secondSet.Id : firstSet.Id, Name = $"Player {i}", Status = status,
            PhotoUrl = "https://example.test/player.png", Age = 23, Position = i == 4 ? "Goalkeeper" : "Forward",
            PreferredFoot = "Right", CardPosition = i == 4 ? "GK" : "ST", BasePrice = 1200,
            JerseyNumber = 7, PreviousTeam = "Previous club", ShortBio = "Player bio",
            Pace = 90, Shooting = 82, Passing = 80, Dribbling = 76, Defending = 60, Physical = 85,
            Diving = 88, Handling = 78, Kicking = 74, Reflexes = 91, Speed = 73, Positioning = 85,
        }).ToList();
        db.Players.AddRange(players);
        db.TournamentMembers.Add(new() { TournamentId = source.Id, UserId = other.Id, Role = TournamentRole.AUCTIONEER });
        db.RegistrationForms.Add(new() { TournamentId = source.Id, Enabled = true, ClosedManually = true,
            OpensAtUtc = DateTime.UtcNow.AddDays(-1), ClosesAtUtc = DateTime.UtcNow, FinalizedAtUtc = DateTime.UtcNow, Instructions = "Bring your kit" });
        db.PlayerRegistrations.Add(new() { Id = Guid.NewGuid(), TournamentId = source.Id, Name = "Private applicant", Phone = "9876543210", Email = "private@test.com", PlayerId = players[2].Id });
        var session = new AuctionSession { TournamentId = source.Id, Status = sourceStatus == TournamentStatus.LIVE ? AuctionSessionStatus.LIVE : AuctionSessionStatus.COMPLETED, CurrentSetId = firstSet.Id };
        var lot = new AuctionLot { TournamentId = source.Id, AuctionSessionId = session.Id, PlayerId = players[2].Id, PlayerSetId = firstSet.Id, WinningTeamId = team.Id, FinalPrice = 10000, Status = AuctionLotStatus.SOLD };
        db.AddRange(session, lot);
        db.AuctionEvents.Add(new() { TournamentId = source.Id, AuctionSessionId = session.Id, AuctionLotId = lot.Id, UserId = owner.Id, EventType = "PLAYER_SOLD" });
        await db.SaveChangesAsync();
        session.CurrentLotId = lot.Id;
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();

        var cloned = await service.CloneTournamentAsync(source.Id, new("  Original Cup — Mock Auction  "), owner.Id);

        Assert.NotEqual(source.Id, cloned.Id); Assert.NotEqual(source.Slug, cloned.Slug);
        Assert.Equal("Original Cup — Mock Auction", cloned.Name);
        Assert.Equal(TournamentStatus.DRAFT, cloned.Status);
        Assert.Equal(owner.Id, cloned.OwnerUserId); Assert.Equal("OWNER", cloned.UserRole);
        Assert.Equal(source.Season, cloned.Season); Assert.Equal(source.Description, cloned.Description);
        Assert.Equal(source.LogoUrl, cloned.LogoUrl); Assert.Equal(source.Location, cloned.Location);
        Assert.Equal(source.TimeZone, cloned.TimeZone); Assert.Equal(source.TournamentDate, cloned.TournamentDate);
        var members = await db.TournamentMembers.Where(m => m.TournamentId == cloned.Id).ToListAsync();
        Assert.Single(members); Assert.Equal(owner.Id, members[0].UserId);
        var copiedSettings = await db.TournamentSettings.SingleAsync(s => s.TournamentId == cloned.Id);
        AssertScalarCopy(db, settings, copiedSettings, "Id", "TournamentId", "CreatedAtUtc", "UpdatedAtUtc");
        var copiedTeam = await db.Teams.SingleAsync(t => t.TournamentId == cloned.Id);
        AssertScalarCopy(db, team, copiedTeam, "Id", "TournamentId", "CreatedAtUtc", "UpdatedAtUtc");
        var copiedTiers = await db.BasePriceTiers.Where(t => t.TournamentId == cloned.Id).OrderBy(t => t.SortOrder).ToListAsync();
        var sourceTiers = await db.BasePriceTiers.Where(t => t.TournamentId == source.Id).OrderBy(t => t.SortOrder).ToListAsync();
        Assert.Equal(sourceTiers.Count, copiedTiers.Count);
        for (var i = 0; i < copiedTiers.Count; i++) AssertScalarCopy(db, sourceTiers[i], copiedTiers[i], "Id", "TournamentId", "CreatedAtUtc");
        var copiedSets = await db.PlayerSets.Where(s => s.TournamentId == cloned.Id).ToListAsync();
        Assert.Equal(2, copiedSets.Count);
        var copiedPlayers = await db.Players.Where(p => p.TournamentId == cloned.Id).OrderBy(p => p.Name).ToListAsync();
        Assert.Equal(players.Count, copiedPlayers.Count);
        for (var i = 0; i < players.Count; i++)
        {
            AssertScalarCopy(db, players[i], copiedPlayers[i], "Id", "TournamentId", "PlayerSetId", "Status", "CreatedAtUtc", "UpdatedAtUtc");
            Assert.Equal("AVAILABLE", copiedPlayers[i].Status);
            Assert.NotEqual(players[i].PlayerSetId, copiedPlayers[i].PlayerSetId);
            Assert.Equal(i == 4 ? "Keepers" : "Forwards", copiedSets.Single(s => s.Id == copiedPlayers[i].PlayerSetId).Name);
        }
        var copiedForm = await db.RegistrationForms.SingleAsync(f => f.TournamentId == cloned.Id);
        Assert.False(copiedForm.Enabled); Assert.False(copiedForm.ClosedManually);
        Assert.Null(copiedForm.OpensAtUtc); Assert.Null(copiedForm.ClosesAtUtc); Assert.Null(copiedForm.FinalizedAtUtc);
        Assert.Equal("Bring your kit", copiedForm.Instructions);
        Assert.False(await db.PlayerRegistrations.AnyAsync(r => r.TournamentId == cloned.Id));
        Assert.False(await db.AuctionSessions.AnyAsync(s => s.TournamentId == cloned.Id));
        Assert.False(await db.AuctionLots.AnyAsync(l => l.TournamentId == cloned.Id));
        Assert.False(await db.AuctionEvents.AnyAsync(e => e.TournamentId == cloned.Id));

        copiedPlayers[2].Status = "SOLD"; copiedPlayers[2].Name = "Mock name"; copiedTeam.InitialPurse = 500;
        await db.SaveChangesAsync();
        Assert.Equal("Player 2", (await db.Players.FindAsync(players[2].Id))!.Name);
        Assert.Equal(75000, (await db.Teams.FindAsync(team.Id))!.InitialPurse);
        Assert.Equal(sourceStatus, (await db.Tournaments.FindAsync(source.Id))!.Status);
        Assert.True(await db.PlayerRegistrations.AnyAsync(r => r.TournamentId == source.Id));
        Assert.Equal(10000, (await db.AuctionLots.FindAsync(lot.Id))!.FinalPrice);
        await service.DeleteTournamentAsync(cloned.Id, owner.Id);
        Assert.True(await db.Tournaments.AnyAsync(t => t.Id == source.Id));
        Assert.True(await db.Players.AnyAsync(p => p.Id == players[2].Id));
    }

    private static void AssertScalarCopy<T>(TournamentAuctionDbContext db, T source, T clone, params string[] except) where T : class
    {
        var original = db.Entry(source).CurrentValues;
        var copied = db.Entry(clone).CurrentValues;
        foreach (var property in original.Properties.Where(p => !except.Contains(p.Name)))
            Assert.Equal(original[property], copied[property]);
    }

    [Theory]
    [InlineData(TournamentRole.AUCTIONEER)]
    [InlineData(TournamentRole.VIEWER)]
    public async Task CloneTournament_OnlyOwnerCanClone(TournamentRole role)
    {
        var (db, service) = CreateService($"{nameof(CloneTournament_OnlyOwnerCanClone)}-{role}");
        var owner = await SeedUserAsync(db);
        var other = await SeedUserAsync(db, "other@test.com");
        var source = await service.CreateTournamentAsync(new("Original Cup", "2026", null, null, null, null, null, null), owner.Id);
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.CloneTournamentAsync(source.Id, new("Mock Cup"), other.Id));
        db.TournamentMembers.Add(new() { TournamentId = source.Id, UserId = other.Id, Role = role });
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.CloneTournamentAsync(source.Id, new("Mock Cup"), other.Id));
        Assert.Single(await db.Tournaments.ToListAsync());
    }

    [Fact]
    public async Task CloneTournament_RepeatedClonesHaveDistinctIdsAndSlugs()
    {
        var (db, service) = CreateService(nameof(CloneTournament_RepeatedClonesHaveDistinctIdsAndSlugs));
        var owner = await SeedUserAsync(db);
        var source = await service.CreateTournamentAsync(new("Original Cup", "2026", null, null, null, null, null, null), owner.Id);
        var first = await service.CloneTournamentAsync(source.Id, new("Mock Cup"), owner.Id);
        var second = await service.CloneTournamentAsync(source.Id, new("Mock Cup"), owner.Id);
        Assert.NotEqual(first.Id, second.Id); Assert.NotEqual(first.Slug, second.Slug);
        Assert.Equal(3, await db.Tournaments.CountAsync());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(" X ")]
    public async Task CloneTournament_InvalidNamesDoNotCreateRecords(string name)
    {
        var (db, service) = CreateService($"{nameof(CloneTournament_InvalidNamesDoNotCreateRecords)}-{name}");
        var owner = await SeedUserAsync(db);
        var source = await service.CreateTournamentAsync(new("Original Cup", "2026", null, null, null, null, null, null), owner.Id);
        await Assert.ThrowsAsync<ArgumentException>(() => service.CloneTournamentAsync(source.Id, new(name), owner.Id));
        await Assert.ThrowsAsync<ArgumentException>(() => service.CloneTournamentAsync(source.Id, new(new string('x', 201)), owner.Id));
        Assert.Single(await db.Tournaments.ToListAsync());
    }
}
