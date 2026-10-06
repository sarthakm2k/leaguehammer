using TournamentAuction.Api.Features.Players;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Api.Features.Auction;

public partial class AuctionEngineService
{
    public async Task<PublicAuctionStateDto> GetPublicAuctionStateAsync(string tournamentKey)
    {
        Guid.TryParse(tournamentKey, out var id);
        var tournament = await _db.Tournaments.Include(t => t.Settings)
            .FirstOrDefaultAsync(t => t.Id == id || t.Slug == tournamentKey);
        if (tournament?.Settings?.PublicLiveViewEnabled != true)
            throw new KeyNotFoundException("Public live view is unavailable for this tournament.");

        var session = await _db.AuctionSessions.Include(s => s.CurrentSet)
            .FirstOrDefaultAsync(s => s.TournamentId == tournament.Id);
        var state = session == null ? await BuildInitialAuctionStateAsync(tournament)
            : await BuildAuctionStateAsync(tournament, session);
        var sold = await _db.AuctionLots.Include(l => l.Player).Include(l => l.PlayerSet)
            .Include(l => l.WinningTeam)
            .Where(l => l.TournamentId == tournament.Id && l.Status == AuctionLotStatus.SOLD)
            .OrderByDescending(l => l.CompletedAtUtc).ThenBy(l => l.Id).ToListAsync();
        // Count players' latest status, rather than counting both attempts of the same player.
        var unsold = await _db.Players.CountAsync(p => p.TournamentId == tournament.Id
            && (p.Status == "UNSOLD" || p.Status == "FINAL_UNSOLD"));
        return new PublicAuctionStateDto(state.TournamentId, state.TournamentName, tournament.Slug,
            state.CurrencyCode, state.CurrencySymbol, state.SessionStatus, state.Version, state.IsUnsoldRound,
            state.CurrentSetName, ToPublic(state.CurrentLot), ToPublic(state.LastResult), state.TotalPlayersCount,
            sold.Count, unsold, state.TeamStandings, sold.Select(l => ToPublic(MapLot(l))!).ToList(), state.CurrentSetSummary,
            state.SellAllPlayers, state.CurrentAttemptNumber);
    }

    public async Task<AuctionStateDto> UpdateBidAsync(Guid tournamentId, UpdateBidRequest request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);
        ValidateSessionIsLive(session);
        var lot = await _db.AuctionLots.Include(l => l.Player)
            .FirstOrDefaultAsync(l => l.Id == request.LotId && l.AuctionSessionId == session.Id);
        if (lot == null || session.CurrentLotId != lot.Id || lot.Status != AuctionLotStatus.ON_AUCTION)
            throw new InvalidOperationException("The bid must belong to the current active player.");
        if (request.CurrentBid < lot.Player.BasePrice || request.CurrentBid > 10000000000)
            throw new InvalidOperationException("The recorded bid must be at least the player's base price and within the price limit.");
        if (tournament.Settings?.SellAllPlayers == true && request.LeadingTeamId == null)
            throw new InvalidOperationException("Select a leading team so Sell all players can validate the remaining purses and squad spaces.");
        if (request.LeadingTeamId is Guid teamId)
        {
            var standings = await CalculateTeamStandingsAsync(tournamentId, tournament.Settings!);
            var team = standings.FirstOrDefault(t => t.TeamId == teamId);
            if (team == null)
                throw new InvalidOperationException("The leading team must belong to this tournament.");
            if (!team.CanBid || request.CurrentBid > team.MaximumAllowedBid)
                throw new InvalidOperationException("This bid exceeds the team's purse or squad reserve limit.");
            await ValidateRemainingPlayerPurchasesAsync(tournament, lot.PlayerId, teamId, request.CurrentBid, lot.Id);
        }
        lot.CurrentBid = request.CurrentBid;
        lot.LeadingTeamId = request.LeadingTeamId;
        lot.UpdatedAtUtc = DateTime.UtcNow;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return await PublishChangeAsync(tournament, session, "BidUpdated", lot.Id);
    }

    // Always called after SaveChanges commits. A delivery failure must never turn a committed sale into an HTTP failure.
    private async Task<AuctionStateDto> PublishChangeAsync(Tournament tournament, AuctionSession session,
        string? eventName = null, Guid? lotId = null, string? reason = null, SetSummaryDto? summary = null)
    {
        var state = await BuildAuctionStateAsync(tournament, session);
        try
        {
            AuctionLotDto? lot = null;
            if (lotId != null)
            {
                var entity = await _db.AuctionLots.Include(l => l.Player).Include(l => l.PlayerSet)
                    .Include(l => l.WinningTeam).FirstAsync(l => l.Id == lotId);
                lot = MapLot(entity);
            }
            var team = state.TeamStandings.FirstOrDefault(t => t.TeamId == lot?.WinningTeamId);
            var admin = _hub.Clients.Group(AuctionHub.AdminGroup(tournament.Id));
            var publicClients = tournament.Settings?.PublicLiveViewEnabled == true
                ? _hub.Clients.Group(AuctionHub.PublicGroup(tournament.Id)) : null;

            object?[]? adminArgs = eventName switch
            {
                "PlayerRevealed" or "PlayerUnsold" => [lot],
                "BidUpdated" => [lot!.CurrentBid, lot.LeadingTeamId?.ToString()],
                "PlayerSold" => [lot, team],
                "ResultCorrected" => [lot, team, reason],
                "SetCompleted" => [summary],
                _ => null
            };
            if (eventName != null && adminArgs != null)
            {
                await admin.SendCoreAsync(eventName, adminArgs);
                if (publicClients != null)
                {
                    object?[] publicArgs = eventName switch
                    {
                        "PlayerRevealed" or "PlayerUnsold" => [ToPublic(lot)],
                        "PlayerSold" or "ResultCorrected" => [ToPublic(lot), team],
                        _ => adminArgs
                    };
                    await publicClients.SendCoreAsync(eventName, publicArgs);
                }
            }
            // Every command invalidates canonical state, including set/round starts and corrections affecting two teams.
            await admin.SendAsync("AuctionStateChanged", state.SessionStatus);
            if (publicClients != null)
                await publicClients.SendAsync("AuctionStateChanged", state.SessionStatus);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast committed auction state for {TournamentId} at version {Version}",
                tournament.Id, session.Version);
        }
        return state;
    }

    private static AuctionLotDto MapLot(AuctionLot lot) => new(lot.Id, lot.AuctionSessionId, lot.PlayerId,
        lot.Player.Name, lot.Player.PhotoUrl, lot.Player.Position, lot.Player.Age, lot.Player.PreferredFoot,
        lot.Player.JerseyNumber, lot.Player.PreviousTeam, lot.Player.ShortBio, lot.PlayerSetId, lot.PlayerSet.Name,
        lot.AttemptNumber, lot.DrawPosition, lot.Status.ToString(), lot.WinningTeamId, lot.WinningTeam?.Name,
        lot.FinalPrice, lot.Player.BasePrice, lot.RevealedAtUtc, lot.CompletedAtUtc, lot.CurrentBid, lot.LeadingTeamId, lot.Player.CardPosition, CardRatings.FromPlayer(lot.Player));

    private static PublicAuctionLotDto? ToPublic(AuctionLotDto? lot) => lot == null ? null : new(lot.LotId,
        lot.PlayerId, lot.PlayerName, lot.PhotoUrl, lot.Position, lot.Age, lot.PreferredFoot, lot.JerseyNumber,
        lot.PlayerSetName, lot.AttemptNumber, lot.Status, lot.WinningTeamId, lot.WinningTeamName, lot.FinalPrice,
        lot.BasePrice, lot.CurrentBid, lot.LeadingTeamId, lot.CardPosition, lot.Ratings);
}
