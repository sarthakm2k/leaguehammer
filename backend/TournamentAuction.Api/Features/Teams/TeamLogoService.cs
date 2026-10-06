using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Teams;

public interface ITeamLogoStorage
{
    Task<string> UploadLogoAsync(Guid tournamentId, Guid teamId, IFormFile logo);
}

public class TeamLogoService(TournamentAuctionDbContext db, ITeamLogoStorage storage)
{
    public async Task<string> UploadAsync(Guid tournamentId, Guid teamId, Guid userId, IFormFile logo)
    {
        if (!await db.TournamentMembers.AnyAsync(m => m.TournamentId == tournamentId && m.UserId == userId && m.Role == TournamentRole.OWNER))
            throw new UnauthorizedAccessException("Only the tournament OWNER can upload team logos.");
        var team = await db.Teams.FirstOrDefaultAsync(t => t.TournamentId == tournamentId && t.Id == teamId)
            ?? throw new KeyNotFoundException("Team not found in this tournament.");
        var url = await storage.UploadLogoAsync(tournamentId, teamId, logo);
        // Branding may change during an auction; purse and squad configuration stays untouched.
        team.LogoUrl = url;
        team.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return url;
    }
}
