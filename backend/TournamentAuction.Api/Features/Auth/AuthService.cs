using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Auth;

public class AuthService : IAuthService
{
    private readonly TournamentAuctionDbContext _db;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<User> _passwordHasher;

    public AuthService(TournamentAuctionDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
        _passwordHasher = new PasswordHasher<User>();
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var exists = await _db.Users.AnyAsync(u => u.Email == normalizedEmail);
        if (exists)
        {
            throw new InvalidOperationException("A user with this email address already exists.");
        }

        var user = new User
        {
            Email = normalizedEmail,
            FullName = request.FullName.Trim(),
            CreatedAtUtc = DateTime.UtcNow
        };

        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        var token = GenerateJwtToken(user);
        return new AuthResponse(token, new UserDto(user.Id, user.Email, user.FullName, user.CreatedAtUtc));
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalizedEmail);
        if (user == null)
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        var verificationResult = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verificationResult == PasswordVerificationResult.Failed)
        {
            throw new UnauthorizedAccessException("Invalid email or password.");
        }

        var token = GenerateJwtToken(user);
        return new AuthResponse(token, new UserDto(user.Id, user.Email, user.FullName, user.CreatedAtUtc));
    }

    public async Task<UserDto?> GetUserByIdAsync(Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null) return null;
        return new UserDto(user.Id, user.Email, user.FullName, user.CreatedAtUtc);
    }

    private string GenerateJwtToken(User user)
    {
        var jwtSecret = _config["Jwt:Secret"] ?? "SuperSecretDevelopmentKeyMustBeAtLeast32BytesLong!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var expiryDays = 7;
        if (int.TryParse(_config["Jwt:ExpiryDays"], out var days))
        {
            expiryDays = days;
        }

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("name", user.FullName),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"] ?? "TournamentAuctionApi",
            audience: _config["Jwt:Audience"] ?? "TournamentAuctionClients",
            claims: claims,
            expires: DateTime.UtcNow.AddDays(expiryDays),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
