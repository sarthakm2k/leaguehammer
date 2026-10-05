using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Features.Auth;
using Xunit;

namespace TournamentAuction.Tests;

public class AuthServiceTests
{
    private (TournamentAuctionDbContext db, AuthService service) CreateService(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                { "Jwt:Secret", "TestSecretKeyAtLeast32BytesLongForTesting!!" },
                { "Jwt:Issuer", "TestIssuer" },
                { "Jwt:Audience", "TestAudience" },
                { "Jwt:ExpiryDays", "1" }
            })
            .Build();

        var service = new AuthService(db, config);
        return (db, service);
    }

    [Fact]
    public async Task RegisterAsync_ValidRequest_CreatesUserAndReturnsToken()
    {
        var (_, service) = CreateService(nameof(RegisterAsync_ValidRequest_CreatesUserAndReturnsToken));

        var req = new RegisterRequest("organizer@league.com", "SecurePassword123!", "Tournament Organizer");
        var response = await service.RegisterAsync(req);

        Assert.NotNull(response.Token);
        Assert.NotEmpty(response.Token);
        Assert.Equal("organizer@league.com", response.User.Email);
        Assert.Equal("Tournament Organizer", response.User.FullName);
    }

    [Fact]
    public async Task RegisterAsync_DuplicateEmail_ThrowsInvalidOperationException()
    {
        var (_, service) = CreateService(nameof(RegisterAsync_DuplicateEmail_ThrowsInvalidOperationException));

        var req = new RegisterRequest("duplicate@league.com", "Password123!", "First User");
        await service.RegisterAsync(req);

        var reqDuplicate = new RegisterRequest("DUPLICATE@league.com", "AnotherPassword!", "Second User");
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RegisterAsync(reqDuplicate));
    }

    [Fact]
    public async Task LoginAsync_ValidCredentials_ReturnsToken()
    {
        var (_, service) = CreateService(nameof(LoginAsync_ValidCredentials_ReturnsToken));

        await service.RegisterAsync(new RegisterRequest("player@test.com", "Pass1234!", "Test Player"));

        var loginResponse = await service.LoginAsync(new LoginRequest("player@test.com", "Pass1234!"));

        Assert.NotNull(loginResponse.Token);
        Assert.Equal("player@test.com", loginResponse.User.Email);
    }

    [Fact]
    public async Task LoginAsync_WrongPassword_ThrowsUnauthorizedAccessException()
    {
        var (_, service) = CreateService(nameof(LoginAsync_WrongPassword_ThrowsUnauthorizedAccessException));

        await service.RegisterAsync(new RegisterRequest("wrong@test.com", "CorrectPassword123!", "User"));

        await Assert.ThrowsAsync<UnauthorizedAccessException>(() =>
            service.LoginAsync(new LoginRequest("wrong@test.com", "WrongPassword!")));
    }
}
