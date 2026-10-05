using System.ComponentModel.DataAnnotations;

namespace TournamentAuction.Api.Features.Auth;

public record RegisterRequest(
    [Required, EmailAddress] string Email,
    [Required, MinLength(6)] string Password,
    [Required, MinLength(2)] string FullName
);

public record LoginRequest(
    [Required, EmailAddress] string Email,
    [Required] string Password
);

public record UserDto(
    Guid Id,
    string Email,
    string FullName,
    DateTime CreatedAtUtc
);

public record AuthResponse(
    string Token,
    UserDto User
);
