using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Preflight;
using TournamentAuction.Api.Features.Registrations;

namespace TournamentAuction.Tests;

public class RegistrationTests
{
    private sealed class Clock : TimeProvider
    {
        public DateTimeOffset Current = new(2026, 10, 5, 10, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Current;
    }
    private sealed class Photos : IRegistrationPhotoStorage
    {
        public bool Available => true;
        public int Uploads, Publications;
        public bool Fail;
        public Task<string> UploadAsync(Guid t, Guid r, IFormFile photo) { Uploads++; if (Fail) throw new HttpRequestException("Storage unavailable"); return Task.FromResult($"{t}/{r}.png"); }
        public Task<string> ReviewUrlAsync(string path) => Task.FromResult($"https://storage.test/private-signed/{path}");
        public Task<string> PublishAsync(string path) { Publications++; return Task.FromResult($"https://storage.test/public/{path}"); }
    }
    private async Task<(TournamentAuctionDbContext db, RegistrationService service, Clock clock, Photos photos, Tournament tournament, PlayerSet set)> Fixture()
    {
        var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var clock = new Clock(); var photos = new Photos();
        var user = new User { Email = "owner@test.example", FullName = "Owner", PasswordHash = "test" };
        var t = new Tournament { Name = "Registration Cup", Slug = "registration-cup", OwnerUserId = user.Id, Owner = user };
        var set = new PlayerSet { TournamentId = t.Id, Tournament = t, Name = "Forwards" };
        db.AddRange(user, t, set, new TournamentSettings { TournamentId = t.Id, MinimumAcquisitionPrice = 500 });
        await db.SaveChangesAsync();
        var service = new RegistrationService(db, new PlayerService(db), photos, clock);
        await service.UpdateSettingsAsync(t.Id, user.Id, new(true, clock.Current.UtcDateTime.AddHours(-1), clock.Current.UtcDateTime.AddHours(1), false, "Bring your game."));
        return (db, service, clock, photos, t, set);
    }
    private static RegistrationSubmissionRequest Submission(Guid? id = null) => new() { SubmissionId = id ?? Guid.NewGuid(), Name = "Arjun Nair", Phone = "+91 98765 43210", Position = "Forward", Age = 24, Consent = true };
    private static RegistrationReviewRequest Review(PlayerSet set, bool approve = true, bool duplicate = false, long price = 500) =>
        new(approve, "Arjun Reviewed", "+91 98765 43210", "player@example.test", 24, "Forward", "Right", 10, "Malabar FC", "Fast winger", set.Id, price, approve ? null : "Not eligible", duplicate);

    [Fact]
    public async Task Submission_StaysPending_AndRetryAfterDeadlineReturnsSameReceipt()
    {
        var (db, service, clock, _, t, _) = await Fixture();
        var request = Submission(); request.CardPosition = "LW";
        var first = await service.SubmitAsync(t.Slug, request);
        Assert.Equal("LW",(await service.ListAsync(t.Id,t.OwnerUserId)).Single().CardPosition);
        clock.Current = clock.Current.AddHours(2);
        var again = await service.SubmitAsync(t.Slug, request);
        Assert.Equal(first, again);
        Assert.Single(db.PlayerRegistrations);
        Assert.Empty(db.Players);
        Assert.Equal("919876543210", db.PlayerRegistrations.Single().Phone);
        Assert.Equal(first, await service.GetReceiptAsync(t.Slug, request.SubmissionId));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
    }
    [Fact]
    public async Task OpeningClosingAndManualClose_AreEnforcedByServerTime()
    {
        var (_, service, clock, _, t, _) = await Fixture();
        await service.UpdateSettingsAsync(t.Id, t.OwnerUserId, new(true, clock.Current.UtcDateTime.AddMinutes(5), clock.Current.UtcDateTime.AddMinutes(10), false, null));
        Assert.Equal("SCHEDULED", (await service.GetPublicAsync(t.Slug)).Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
        clock.Current = clock.Current.AddMinutes(5);
        await service.SubmitAsync(t.Slug, Submission());
        clock.Current = clock.Current.AddMinutes(5);
        Assert.Equal("CLOSED", (await service.GetPublicAsync(t.Slug)).Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
        await service.UpdateSettingsAsync(t.Id, t.OwnerUserId, new(true, clock.Current.UtcDateTime.AddHours(-1), clock.Current.UtcDateTime.AddHours(1), true, null));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
    }
    [Fact]
    public async Task ReviewApprovesEditedProfile_WithoutPublishingContactDetails()
    {
        var (db, service, _, photos, t, set) = await Fixture();
        var request = Submission(); request.Photo = new FormFile(new MemoryStream([1,2,3]), 0, 3, "photo", "player.png");
        await service.SubmitAsync(t.Slug, request);
        Assert.Equal(1, photos.Uploads); Assert.Equal(0, photos.Publications);
        var entry = (await service.ListAsync(t.Id, t.OwnerUserId)).Single();
        Assert.True(entry.HasPhoto); Assert.Null(entry.PhotoUrl);
        Assert.Contains("private-signed", System.Text.Json.JsonSerializer.Serialize(await service.GetPhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId)));
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.GetPhotoAsync(t.Id, request.SubmissionId, Guid.NewGuid()));
        await service.ReviewAsync(t.Id, request.SubmissionId, t.OwnerUserId, Review(set));
        var player = Assert.Single(db.Players);
        Assert.Equal("Arjun Reviewed", player.Name); Assert.Equal(500, player.BasePrice);
        Assert.Equal("AVAILABLE", player.Status); Assert.Contains("/public/", player.PhotoUrl!);
        Assert.Equal(player.Id, db.PlayerRegistrations.Single().PlayerId);
        Assert.Equal(1, photos.Publications);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ReviewAsync(t.Id, request.SubmissionId, t.OwnerUserId, Review(set)));
        Assert.Single(db.Players);
    }
    [Fact]
    public async Task RejectAndFinalize_DoNotAddPlayer_AndLockFurtherChanges()
    {
        var (db, service, _, _, t, set) = await Fixture(); var submission = Submission();
        await service.SubmitAsync(t.Slug, submission);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.FinalizeAsync(t.Id, t.OwnerUserId));
        await service.ReviewAsync(t.Id, submission.SubmissionId, t.OwnerUserId, Review(set, false));
        Assert.Empty(db.Players); Assert.Equal("REJECTED", db.PlayerRegistrations.Single().Status);
        Assert.Equal("FINALIZED", (await service.FinalizeAsync(t.Id, t.OwnerUserId)).Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateSettingsAsync(t.Id, t.OwnerUserId, new(false, null, null, false, null)));
    }
    [Fact]
    public async Task DuplicateWarnings_RequireExplicitConfirmation()
    {
        var (db, service, _, _, t, set) = await Fixture(); var a = Submission(); var b = Submission();
        await service.SubmitAsync(t.Slug, a); await service.SubmitAsync(t.Slug, b);
        Assert.All(await service.ListAsync(t.Id, t.OwnerUserId), r => Assert.True(r.PossibleDuplicate));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ReviewAsync(t.Id, a.SubmissionId, t.OwnerUserId, Review(set)));
        Assert.Empty(db.Players);
        await service.ReviewAsync(t.Id, a.SubmissionId, t.OwnerUserId, Review(set, duplicate: true));
        Assert.Single(db.Players);
    }
    [Fact]
    public async Task InvalidSetOrPrice_DoesNotApproveSubmission()
    {
        var (db, service, _, _, t, set) = await Fixture(); var a = Submission(); await service.SubmitAsync(t.Slug, a);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ReviewAsync(t.Id, a.SubmissionId, t.OwnerUserId, Review(set, price: 100)));
        Assert.Empty(db.Players); Assert.Equal("PENDING", db.PlayerRegistrations.Single().Status);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.ReviewAsync(t.Id, a.SubmissionId, t.OwnerUserId, Review(set) with { PlayerSetId = Guid.NewGuid() }));
        Assert.Empty(db.Players); Assert.Equal("PENDING", db.PlayerRegistrations.Single().Status);
    }
    [Fact]
    public async Task UnrelatedUsersAndViewers_CannotAccessReviewOrSettings()
    {
        var (db, service, _, _, t, _) = await Fixture(); var viewer = Guid.NewGuid();
        db.TournamentMembers.Add(new TournamentMember { TournamentId = t.Id, UserId = viewer, Role = TournamentRole.VIEWER }); await db.SaveChangesAsync();
        foreach (var user in new[] { viewer, Guid.NewGuid() })
        {
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.ListAsync(t.Id, user));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.GetSettingsAsync(t.Id, user));
            await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.FinalizeAsync(t.Id, user));
        }
    }
    [Fact]
    public async Task ConsentHoneypotAndPhoneValidation_RejectBadSubmissions()
    {
        var (db, service, _, _, t, _) = await Fixture();
        var a = Submission(); a.Consent = false;
        await Assert.ThrowsAsync<ArgumentException>(() => service.SubmitAsync(t.Slug, a));
        a.Consent = true; a.Website = "bot";
        await Assert.ThrowsAsync<ArgumentException>(() => service.SubmitAsync(t.Slug, a));
        a.Website = ""; a.Phone = "abc";
        await Assert.ThrowsAsync<ArgumentException>(() => service.SubmitAsync(t.Slug, a));
        Assert.Empty(db.PlayerRegistrations);
    }
    [Fact]
    public async Task ReadyTournamentStopsNewSubmissions_AndPreflightRequiresFinalization()
    {
        var (db, service, _, _, t, _) = await Fixture();
        var preflight = new TournamentPreflightService(db);
        Assert.Contains((await preflight.RunPreflightAsync(t.Id, t.OwnerUserId)).Checks, c => c.Key == "REGISTRATION_FINALIZED" && c.Status == "FAIL");
        await service.FinalizeAsync(t.Id, t.OwnerUserId);
        Assert.Contains((await preflight.RunPreflightAsync(t.Id, t.OwnerUserId)).Checks, c => c.Key == "REGISTRATION_FINALIZED" && c.Status == "PASS");
        t.Status = TournamentStatus.READY; await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SubmitAsync(t.Slug, Submission()));
    }
    [Theory]
    [InlineData("image/svg+xml", "<svg></svg>")]
    [InlineData("image/png", "not really an image")]
    public void PhotoUploadRejectsUnsupportedOrMismatchedContent(string type, string content)
        => Assert.Throws<ArgumentException>(() => RegistrationPhotoStorage.ValidatePhoto(System.Text.Encoding.UTF8.GetBytes(content), type));

    [Fact]
    public async Task ReviewerCanAddAndReplacePrivatePhotoBeforeApproval()
    {
        var (db, service, _, photos, t, set) = await Fixture(); var request = Submission();
        await service.SubmitAsync(t.Slug, request);
        var file = new FormFile(new MemoryStream([1]), 0, 1, "photo", "photo.png");
        await service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, file);
        var first = db.PlayerRegistrations.Single().PhotoPath;
        await service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, file);
        Assert.NotEqual(first, db.PlayerRegistrations.Single().PhotoPath);
        Assert.Equal(0, photos.Publications); Assert.Empty(db.Players);
        await service.ReviewAsync(t.Id, request.SubmissionId, t.OwnerUserId, Review(set));
        Assert.Contains(db.PlayerRegistrations.Single().PhotoPath!, db.Players.Single().PhotoUrl!);
        Assert.Equal(1, photos.Publications);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, null));
    }
    [Fact]
    public async Task RemovingPendingPhotoPreventsPublicationAndFailedReplacementPreservesIt()
    {
        var (db, service, _, photos, t, set) = await Fixture(); var request = Submission();
        var file = new FormFile(new MemoryStream([1]), 0, 1, "photo", "photo.png"); request.Photo = file;
        await service.SubmitAsync(t.Slug, request); var original = db.PlayerRegistrations.Single().PhotoPath; photos.Fail = true;
        await Assert.ThrowsAsync<HttpRequestException>(() => service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, file));
        Assert.Equal(original, db.PlayerRegistrations.Single().PhotoPath);
        await service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, null);
        Assert.False((await service.ListAsync(t.Id, t.OwnerUserId)).Single().HasPhoto);
        await service.ReviewAsync(t.Id, request.SubmissionId, t.OwnerUserId, Review(set));
        Assert.Null(db.Players.Single().PhotoUrl); Assert.Equal(0, photos.Publications);
    }
    [Fact]
    public async Task PhotoUpdatesEnforcePermissionsAndReviewLocksBeforeStorage()
    {
        var (_, service, _, photos, t, set) = await Fixture(); var request = Submission(); await service.SubmitAsync(t.Slug, request);
        var file = new FormFile(new MemoryStream([1]), 0, 1, "photo", "photo.png");
        await Assert.ThrowsAsync<UnauthorizedAccessException>(() => service.UpdatePhotoAsync(t.Id, request.SubmissionId, Guid.NewGuid(), file));
        await service.ReviewAsync(t.Id, request.SubmissionId, t.OwnerUserId, Review(set, false));
        await service.FinalizeAsync(t.Id, t.OwnerUserId);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdatePhotoAsync(t.Id, request.SubmissionId, t.OwnerUserId, file));
        Assert.Equal(0, photos.Uploads);
    }
    [Fact]
    public async Task CrossTournamentPhotoUpdateCannotTouchAnotherSubmission()
    {
        var (db, service, _, photos, t, _) = await Fixture();var request=Submission();await service.SubmitAsync(t.Slug,request);
        var other=new Tournament { OwnerUserId=t.OwnerUserId };db.Tournaments.Add(other);await db.SaveChangesAsync();
        await Assert.ThrowsAsync<KeyNotFoundException>(()=>service.UpdatePhotoAsync(other.Id,request.SubmissionId,t.OwnerUserId,new FormFile(new MemoryStream([1]),0,1,"photo","photo.png")));
        Assert.Equal(0,photos.Uploads);
    }
}
