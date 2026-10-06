using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using TournamentAuction.Api.Features.Registrations;

namespace TournamentAuction.Tests;

public class RegistrationStorageTests
{
    private sealed class StorageHandler : HttpMessageHandler
    {
        public List<string> Calls = [];
        public bool Fail;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            Assert.Equal("server-only-test-key", request.Headers.Authorization?.Parameter);
            Assert.Equal("server-only-test-key", request.Headers.GetValues("apikey").Single());
            Calls.Add($"{request.Method} {request.RequestUri!.AbsolutePath}");
            if (Fail) return new(HttpStatusCode.Unauthorized);
            if (request.RequestUri.AbsolutePath.Contains("/sign/"))
            {
                Assert.Contains("3600", await request.Content!.ReadAsStringAsync(cancellationToken));
                return new(HttpStatusCode.OK) { Content = new StringContent("{\"signedURL\":\"/object/sign/registration-photos/test.png?token=temporary\"}") };
            }
            if (request.Method == HttpMethod.Get) return new(HttpStatusCode.OK) { Content = new ByteArrayContent([137,80,78,71,13,10,26,10]) { Headers = { ContentType = new("image/png") } } };
            Assert.Equal("true", request.Headers.GetValues("x-upsert").Single());
            Assert.Equal("image/png", request.Content!.Headers.ContentType?.MediaType);
            Assert.Equal(new byte[] {137,80,78,71,13,10,26,10}, await request.Content.ReadAsByteArrayAsync(cancellationToken));
            return new(HttpStatusCode.OK) { Content = new StringContent("{}") };
        }
    }
    private static RegistrationPhotoStorage Storage(StorageHandler handler) => new(new HttpClient(handler), new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> {
        ["Supabase:Url"] = "https://project.supabase.co", ["Supabase:ServiceRoleKey"] = "server-only-test-key",
    }).Build());
    private static IFormFile Photo() => new FormFile(new MemoryStream([137,80,78,71,13,10,26,10]), 0, 8, "photo", "untrusted-filename.exe") { Headers = new HeaderDictionary(), ContentType = "image/png" };
    [Fact]
    public async Task UploadReviewAndApprovalUsePrivateThenPublicStorage_WithServerOnlyAuthorization()
    {
        var handler = new StorageHandler(); var storage = Storage(handler); var tournament = Guid.NewGuid(); var submission = Guid.NewGuid();
        var path = await storage.UploadAsync(tournament, submission, Photo());
        Assert.Equal($"{tournament}/{submission}.png", path);
        Assert.Contains("/storage/v1/object/sign/", await storage.ReviewUrlAsync(path));
        Assert.Equal($"https://project.supabase.co/storage/v1/object/public/player-photos/{path}", await storage.PublishAsync(path));
        Assert.Equal(new[] { $"POST /storage/v1/object/registration-photos/{path}", $"POST /storage/v1/object/sign/registration-photos/{path}", $"GET /storage/v1/object/authenticated/registration-photos/{path}", $"POST /storage/v1/object/player-photos/{path}" }, handler.Calls);
    }
    [Fact]
    public async Task StorageFailureReturnsRetryableErrorWithoutLeakingCredentials()
    {
        var storage = Storage(new StorageHandler { Fail = true });
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => storage.UploadAsync(Guid.NewGuid(), Guid.NewGuid(), Photo()));
        Assert.DoesNotContain("server-only-test-key", error.Message);
    }
    [Fact]
    public async Task MissingStorageConfigurationDoesNotPretendPhotoWasSaved()
    {
        var storage = new RegistrationPhotoStorage(new HttpClient(), new ConfigurationBuilder().Build());
        Assert.False(storage.Available);
        await Assert.ThrowsAsync<InvalidOperationException>(() => storage.UploadAsync(Guid.NewGuid(), Guid.NewGuid(), Photo()));
    }
    [Fact]
    public async Task LogosUsePublicBucketAndVersionedNamesWithServerCredentials()
    {
        var handler = new StorageHandler(); var storage = Storage(handler); var tournament = Guid.NewGuid(); var team = Guid.NewGuid();
        var first = await storage.UploadLogoAsync(tournament, team, Photo());
        var second = await storage.UploadLogoAsync(tournament, team, Photo());
        Assert.StartsWith($"https://project.supabase.co/storage/v1/object/public/player-photos/team-logos/{tournament}/{team}/", first);
        Assert.NotEqual(first, second);
        Assert.All(handler.Calls, call => Assert.StartsWith("POST /storage/v1/object/player-photos/team-logos/", call));
    }
    [Fact]
    public async Task InvalidLogoBytesNeverReachStorage()
    {
        var handler = new StorageHandler(); var storage = Storage(handler);
        var file = new FormFile(new MemoryStream([1,2,3]), 0, 3, "logo", "logo.png") { Headers = new HeaderDictionary(), ContentType = "image/png" };
        await Assert.ThrowsAsync<ArgumentException>(() => storage.UploadLogoAsync(Guid.NewGuid(), Guid.NewGuid(), file));
        Assert.Empty(handler.Calls);
    }
}
