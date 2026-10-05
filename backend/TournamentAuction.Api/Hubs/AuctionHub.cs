using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;

namespace TournamentAuction.Api.Hubs;

public class AuctionHub(TournamentAuctionDbContext db) : Hub
{
    public static string AdminGroup(Guid id) => $"admin:tournament:{id:D}";
    public static string PublicGroup(Guid id) => $"public:tournament:{id:D}";

    public async Task JoinAuction(string tournamentId)
    {
        if (!Guid.TryParse(tournamentId, out var id))
            throw new HubException("Invalid tournament ID.");

        var tournament = await db.Tournaments.Include(t => t.Settings).Include(t => t.Members)
            .AsNoTracking().FirstOrDefaultAsync(t => t.Id == id);
        if (tournament == null)
            throw new HubException("Tournament is unavailable.");

        var isMember = Guid.TryParse(Context.User?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)
            && (tournament.OwnerUserId == userId || tournament.Members.Any(m => m.UserId == userId));
        if (!isMember && tournament.Settings?.PublicLiveViewEnabled != true)
            throw new HubException("Public live view is disabled for this tournament.");

        await Groups.AddToGroupAsync(Context.ConnectionId, isMember ? AdminGroup(id) : PublicGroup(id));
    }

    public async Task LeaveAuction(string tournamentId)
    {
        if (!Guid.TryParse(tournamentId, out var id))
            throw new HubException("Invalid tournament ID.");
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, AdminGroup(id));
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, PublicGroup(id));
    }

    // Preserve the original hub API for existing clients.
    public Task JoinTournamentGroup(string tournamentId) => JoinAuction(tournamentId);
    public Task LeaveTournamentGroup(string tournamentId) => LeaveAuction(tournamentId);
}
