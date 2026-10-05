namespace TournamentAuction.Api.Features.Auction;

public record PurchaseCapacity(long Purse, int Slots, int MinimumPlayersNeeded);
public enum PurchaseFeasibility { Feasible, Infeasible, SearchLimit }

// Find a complete base-price allocation, rather than relying on total purse alone.
// A bounded search fails closed when it cannot establish feasibility within its work budget.
public static class RemainingPlayerFeasibility
{
    public static PurchaseFeasibility Check(IEnumerable<long> basePrices, IEnumerable<PurchaseCapacity> capacities, int searchLimit = 50000)
    {
        var prices = basePrices.OrderDescending().ToArray();
        var teams = capacities.ToArray();
        if (prices.Any(p => p <= 0) || teams.Any(t => t.Purse < 0 || t.Slots < 0 || t.MinimumPlayersNeeded < 0 || t.MinimumPlayersNeeded > t.Slots))
            return PurchaseFeasibility.Infeasible;
        if (!Possible(0, teams)) return PurchaseFeasibility.Infeasible;
        if (prices.Length == 0) return PurchaseFeasibility.Feasible;

        // Most tournament pools have a simple witness; try both purchase strategies before searching.
        foreach (var tightestFirst in new[] { true, false })
        {
            var trial = teams.ToArray();
            var assigned = true;
            foreach (var price in prices)
            {
                var candidates = Enumerable.Range(0, trial.Length).Where(i => trial[i].Slots > 0 && trial[i].Purse >= price)
                    .OrderByDescending(i => trial[i].MinimumPlayersNeeded > 0);
                var index = (tightestFirst ? candidates.ThenBy(i => trial[i].Purse) : candidates.ThenByDescending(i => trial[i].Purse))
                    .DefaultIfEmpty(-1).First();
                if (index < 0) { assigned = false; break; }
                trial[index] = Buy(trial[index], price);
            }
            if (assigned && trial.All(t => t.MinimumPlayersNeeded == 0)) return PurchaseFeasibility.Feasible;
        }

        if (prices.Length > 2000) return PurchaseFeasibility.SearchLimit;
        var failed = new HashSet<string>();
        var visited = 0;
        var exhausted = false;
        return Search(0) ? PurchaseFeasibility.Feasible : exhausted ? PurchaseFeasibility.SearchLimit : PurchaseFeasibility.Infeasible;

        bool Possible(int offset, PurchaseCapacity[] state)
        {
            var remaining = prices.Length - offset;
            if (state.Sum(t => (long)t.Slots) < remaining || state.Sum(t => (long)t.MinimumPlayersNeeded) > remaining) return false;
            if (remaining == 0) return state.All(t => t.MinimumPlayersNeeded == 0);
            if (prices.Skip(offset).Sum() > state.Where(t => t.Slots > 0).Sum(t => t.Purse)) return false;
            if (!state.Any(t => t.Slots > 0 && t.Purse >= prices[offset])) return false;
            // Even buying the cheapest remaining players must cover every team's minimum squad.
            return state.All(t => t.MinimumPlayersNeeded <= remaining &&
                prices.Skip(prices.Length - t.MinimumPlayersNeeded).Sum() <= t.Purse);
        }

        bool Search(int offset)
        {
            if (++visited > searchLimit) { exhausted = true; return false; }
            if (!Possible(offset, teams)) return false;
            if (offset == prices.Length) return true;
            var key = offset + ":" + string.Join(";", teams.OrderBy(t => t.Purse).ThenBy(t => t.Slots).ThenBy(t => t.MinimumPlayersNeeded)
                .Select(t => $"{t.Purse},{t.Slots},{t.MinimumPlayersNeeded}"));
            if (failed.Contains(key)) return false;
            var identical = new HashSet<PurchaseCapacity>();
            foreach (var i in Enumerable.Range(0, teams.Length).Where(i => teams[i].Slots > 0 && teams[i].Purse >= prices[offset])
                .OrderByDescending(i => teams[i].MinimumPlayersNeeded > 0).ThenBy(i => teams[i].Purse).ToArray())
            {
                var before = teams[i];
                if (!identical.Add(before)) continue;
                teams[i] = Buy(before, prices[offset]);
                var found = Search(offset + 1);
                teams[i] = before;
                if (found) return true;
                if (exhausted) return false;
            }
            failed.Add(key);
            return false;
        }
    }

    private static PurchaseCapacity Buy(PurchaseCapacity team, long price) =>
        new(team.Purse - price, team.Slots - 1, Math.Max(0, team.MinimumPlayersNeeded - 1));
}
