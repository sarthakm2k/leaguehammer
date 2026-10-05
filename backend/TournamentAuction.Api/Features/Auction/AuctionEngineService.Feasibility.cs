using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Auction;

public partial class AuctionEngineService
{
    private async Task ValidateRemainingPlayerPurchasesAsync(Tournament tournament, Guid playerId, Guid teamId, long price, Guid replacedLotId)
    {
        var settings = tournament.Settings!;
        if (!settings.SellAllPlayers) return;
        // Removing the corrected result refunds its former team before applying the proposed purchase.
        var sales = await _db.AuctionLots.AsNoTracking().Where(l => l.TournamentId == tournament.Id &&
            l.Status == AuctionLotStatus.SOLD && l.Id != replacedLotId)
            .Select(l => new { l.PlayerId, l.WinningTeamId, l.FinalPrice }).ToListAsync();
        var purchased = sales.Select(l => l.PlayerId).Append(playerId).ToHashSet();
        var players = await _db.Players.AsNoTracking().Where(p => p.TournamentId == tournament.Id)
            .Select(p => new { p.Id, p.BasePrice }).ToListAsync();
        var teams = await _db.Teams.AsNoTracking().Where(t => t.TournamentId == tournament.Id).ToListAsync();
        var capacities = teams.Select(t => {
            var squad = sales.Count(l => l.WinningTeamId == t.Id) + (t.Id == teamId ? 1 : 0);
            var spent = sales.Where(l => l.WinningTeamId == t.Id).Sum(l => l.FinalPrice ?? 0) + (t.Id == teamId ? price : 0);
            return new PurchaseCapacity(t.InitialPurse - spent, settings.MaximumSquadSize - squad, Math.Max(0, settings.MinimumSquadSize - squad));
        });
        var result = RemainingPlayerFeasibility.Check(players.Where(p => !purchased.Contains(p.Id))
            .Select(p => Math.Max(p.BasePrice, settings.MinimumAcquisitionPrice)), capacities);
        if (result == PurchaseFeasibility.Infeasible)
            throw new InvalidOperationException("Sell all players: this purchase would leave remaining players without enough team purse or squad space at their actual base prices. Reduce the bid or choose another team.");
        if (result == PurchaseFeasibility.SearchLimit)
            throw new InvalidOperationException("Sell all players: a safe allocation of the remaining players could not be verified within the validation limit. This purchase has not been accepted. Try a lower bid or another team.");
    }
}
