using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Registrations;

// A separate purpose binds this read-only capability to one tournament. It is not an auth token.
public sealed class RegistrationViewerTokens(byte[] key)
{
    public string ForTournament(Guid tournamentId) => Convert.ToHexStringLower(
        HMACSHA256.HashData(key, Encoding.UTF8.GetBytes($"LeagueHammer:registration-view:v1:{tournamentId:N}")));

    public bool IsValid(Guid tournamentId, string token) => token.Length == 64 &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(ForTournament(tournamentId)), Encoding.UTF8.GetBytes(token));
}

public class RegistrationViewerService(TournamentAuctionDbContext db, RegistrationViewerTokens tokens,
    IRegistrationPhotoStorage photos, TimeProvider clock)
{
    public async Task<RegistrationViewerLinkDto> GetLinkAsync(Guid id, Guid user)
    {
        var tournament = await db.Tournaments.AsNoTracking().SingleOrDefaultAsync(t => t.Id == id)
            ?? throw new KeyNotFoundException("Tournament not found.");
        if (tournament.OwnerUserId != user && !await db.TournamentMembers.AnyAsync(m => m.TournamentId == id && m.UserId == user &&
            (m.Role == TournamentRole.OWNER || m.Role == TournamentRole.AUCTIONEER)))
            throw new UnauthorizedAccessException("Only tournament owners and auctioneers can share the registration list.");
        return new($"/registrations/{Uri.EscapeDataString(tournament.Slug)}/view/{tokens.ForTournament(id)}");
    }

    private async Task<Tournament> SharedTournament(string slug, string token)
    {
        var tournament = await db.Tournaments.AsNoTracking().SingleOrDefaultAsync(t => t.Slug == slug);
        if (tournament == null || !tokens.IsValid(tournament.Id, token))
            throw new KeyNotFoundException("This registration viewing link is unavailable. Ask the organiser for the correct link.");
        return tournament;
    }

    public async Task<RegistrationViewerDto> ListAsync(string slug, string token)
    {
        var tournament = await SharedTournament(slug, token);
        var players = await db.PlayerRegistrations.AsNoTracking().Where(r => r.TournamentId == tournament.Id)
            .OrderByDescending(r => r.SubmittedAtUtc).ThenBy(r => r.Id)
            .Select(r => new RegistrationViewerPlayerDto(r.Id, r.Name, r.Age, r.Position, r.PreferredFoot,
                r.Status, r.SubmittedAtUtc, r.PhotoPath != null)).ToListAsync();
        return new(tournament.Name, tournament.TimeZone, clock.GetUtcNow().UtcDateTime, players);
    }

    public async Task<string> PhotoAsync(string slug, string token, Guid playerId)
    {
        var tournament = await SharedTournament(slug, token);
        var registration = await db.PlayerRegistrations.AsNoTracking()
            .SingleOrDefaultAsync(r => r.TournamentId == tournament.Id && r.Id == playerId);
        if (registration?.PhotoPath == null) throw new KeyNotFoundException("Player photo unavailable.");
        return await photos.ReviewUrlAsync(registration.PhotoPath);
    }
}
