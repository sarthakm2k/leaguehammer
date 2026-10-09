using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Players;

public interface IPlayerPhotoStorage
{
    Task<string> UploadPlayerPhotoAsync(Guid tournamentId, Guid playerId, IFormFile photo);
}

public class PlayerPhotoService(TournamentAuctionDbContext db, IPlayerPhotoStorage storage)
{
    private async Task<Player> GetOwnedPlayer(Guid tournamentId, Guid playerId, Guid userId)
    {
        if (!await db.TournamentMembers.AnyAsync(m => m.TournamentId == tournamentId && m.UserId == userId && m.Role == TournamentRole.OWNER))
            throw new UnauthorizedAccessException("Only the tournament OWNER can manage player photos.");
        return await db.Players.FirstOrDefaultAsync(p => p.TournamentId == tournamentId && p.Id == playerId)
            ?? throw new KeyNotFoundException("Player not found in this tournament.");
    }
    public async Task<string> UploadAsync(Guid tournamentId, Guid playerId, Guid userId, IFormFile photo)
    {
        var player = await GetOwnedPlayer(tournamentId, playerId, userId);
        var url = await storage.UploadPlayerPhotoAsync(tournamentId, playerId, photo);
        player.PhotoUrl = url; player.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return url;
    }
    public async Task RemoveAsync(Guid tournamentId, Guid playerId, Guid userId)
    {
        var player = await GetOwnedPlayer(tournamentId, playerId, userId);
        // Cloned tournaments may share an image URL. Unlink only this profile,
        // rather than deleting storage content referenced by another tournament.
        player.PhotoUrl = null; player.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
