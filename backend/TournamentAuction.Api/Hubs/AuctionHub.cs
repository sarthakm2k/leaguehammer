using Microsoft.AspNetCore.SignalR;

namespace TournamentAuction.Api.Hubs;

public class AuctionHub : Hub
{
    public async Task JoinTournamentGroup(string tournamentId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"tournament:{tournamentId}");
    }

    public async Task LeaveTournamentGroup(string tournamentId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"tournament:{tournamentId}");
    }
}
