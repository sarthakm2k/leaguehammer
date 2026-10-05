using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Preflight;

public class TournamentPreflightService : ITournamentPreflightService
{
    private readonly TournamentAuctionDbContext _db;

    public TournamentPreflightService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<PreflightReportDto> RunPreflightAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await _db.Tournaments
            .Include(t => t.Settings)
            .Include(t => t.Teams)
            .Include(t => t.PlayerSets)
                .ThenInclude(s => s.Players)
            .Include(t => t.Players)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
            throw new KeyNotFoundException("Tournament not found");

        await AssertCanViewTournamentAsync(tournamentId, userId);

        var checks = new List<PreflightCheckItem>();
        var blockingErrors = new List<string>();
        var warnings = new List<string>();

        var settings = tournament.Settings;
        var teams = tournament.Teams.ToList();
        var sets = tournament.PlayerSets.OrderBy(s => s.SortOrder).ToList();
        var players = tournament.Players.ToList();

        // 1. Settings Checks
        if (settings == null)
        {
            var msg = "Tournament auction rules and purse settings are missing.";
            checks.Add(new PreflightCheckItem("SETTINGS_EXIST", "Settings", "Auction Settings Configured", "FAIL", msg, "Visit Auction Rules tab"));
            blockingErrors.Add(msg);
        }
        else
        {
            checks.Add(new PreflightCheckItem("SETTINGS_EXIST", "Settings", "Auction Settings Configured", "PASS", 
                $"Currency: {settings.CurrencyCode} ({settings.CurrencySymbol}), Default Starting Purse: {settings.CurrencySymbol}{settings.DefaultStartingPurse:N0}"));

            if (settings.MinimumSquadSize < 1 || settings.MaximumSquadSize < settings.MinimumSquadSize)
            {
                var msg = $"Invalid squad limit settings: Minimum Squad ({settings.MinimumSquadSize}) cannot exceed Maximum Squad ({settings.MaximumSquadSize}).";
                checks.Add(new PreflightCheckItem("SQUAD_LIMITS", "Settings", "Squad Size Range", "FAIL", msg, "Correct squad limits in Auction Rules"));
                blockingErrors.Add(msg);
            }
            else
            {
                checks.Add(new PreflightCheckItem("SQUAD_LIMITS", "Settings", "Squad Size Range", "PASS", 
                    $"Minimum Squad: {settings.MinimumSquadSize} players, Maximum Squad: {settings.MaximumSquadSize} players"));
            }

            if (settings.MinimumAcquisitionPrice < 10)
            {
                var msg = "Minimum acquisition price must be at least 10.";
                checks.Add(new PreflightCheckItem("PRICE_FLOOR", "Settings", "Base Price Floor", "FAIL", msg));
                blockingErrors.Add(msg);
            }
            else
            {
                checks.Add(new PreflightCheckItem("PRICE_FLOOR", "Settings", "Base Price Floor", "PASS", 
                    $"Price Floor: {settings.CurrencySymbol}{settings.MinimumAcquisitionPrice:N0}, Default Bid Increment: {settings.CurrencySymbol}{settings.DefaultBidIncrement:N0}"));
            }
        }

        // 2. Teams Checks
        int minSquad = settings?.MinimumSquadSize ?? 11;
        long minPriceFloor = settings?.MinimumAcquisitionPrice ?? 500;
        long minPurseFloor = minSquad * minPriceFloor;

        if (teams.Count < 2)
        {
            var msg = $"At least 2 participating teams are required to conduct an auction (currently {teams.Count} registered).";
            checks.Add(new PreflightCheckItem("TEAMS_COUNT", "Teams", "Participating Teams", "FAIL", msg, "Register at least 2 teams in Participating Teams tab"));
            blockingErrors.Add(msg);
        }
        else
        {
            checks.Add(new PreflightCheckItem("TEAMS_COUNT", "Teams", "Participating Teams", "PASS", 
                $"{teams.Count} participating teams confirmed"));
        }

        // Check each team's purse sufficiency
        var underfundedTeams = teams.Where(t => t.InitialPurse < minPurseFloor).ToList();
        if (underfundedTeams.Count > 0)
        {
            var teamNames = string.Join(", ", underfundedTeams.Select(t => t.Name));
            var msg = $"Insufficient starting purse: {underfundedTeams.Count} team(s) ({teamNames}) have purses below the minimum reserve ({settings?.CurrencySymbol ?? "₹"}{minPurseFloor:N0}) needed to acquire the minimum squad of {minSquad} players.";
            checks.Add(new PreflightCheckItem("TEAM_PURSE_FLOOR", "Teams", "Team Purse Reserve Feasibility", "FAIL", msg, "Increase starting purses in Teams tab"));
            blockingErrors.Add(msg);
        }
        else if (teams.Count > 0)
        {
            checks.Add(new PreflightCheckItem("TEAM_PURSE_FLOOR", "Teams", "Team Purse Reserve Feasibility", "PASS", 
                $"All {teams.Count} teams have sufficient purse (>= {settings?.CurrencySymbol ?? "₹"}{minPurseFloor:N0}) to acquire required squads"));
        }

        // 3. Player Sets Checks
        if (sets.Count == 0)
        {
            var msg = "At least 1 player set must be defined to sequence auction lots.";
            checks.Add(new PreflightCheckItem("SETS_COUNT", "Sets", "Auction Sets Defined", "FAIL", msg, "Add player sets in Player Sets tab"));
            blockingErrors.Add(msg);
        }
        else
        {
            checks.Add(new PreflightCheckItem("SETS_COUNT", "Sets", "Auction Sets Defined", "PASS", 
                $"{sets.Count} ordered auction sets configured"));
        }

        var emptySets = sets.Where(s => s.Players.Count == 0).ToList();
        if (emptySets.Count > 0)
        {
            var setNames = string.Join(", ", emptySets.Select(s => s.Name));
            var msg = $"Notice: {emptySets.Count} player set(s) ({setNames}) have 0 players assigned. These rounds will be skipped during auction.";
            checks.Add(new PreflightCheckItem("EMPTY_SETS", "Sets", "Set Distribution", "WARN", msg, "Assign players or delete empty sets"));
            warnings.Add(msg);
        }
        else if (sets.Count > 0)
        {
            checks.Add(new PreflightCheckItem("EMPTY_SETS", "Sets", "Set Distribution", "PASS", 
                "All player sets contain at least one registered player"));
        }

        // 4. Player Registry & Mathematical Squad Feasibility
        int requiredMinPlayers = teams.Count * minSquad;

        if (players.Count == 0)
        {
            var msg = "No players registered in the tournament pool.";
            checks.Add(new PreflightCheckItem("PLAYERS_EXIST", "Players", "Player Pool", "FAIL", msg, "Add players manually or import CSV in Player Registry"));
            blockingErrors.Add(msg);
        }
        else
        {
            checks.Add(new PreflightCheckItem("PLAYERS_EXIST", "Players", "Player Pool", "PASS", 
                $"{players.Count} players registered in the tournament database"));
        }

        // Check for players below price floor
        var underpricedPlayers = players.Where(p => p.BasePrice < minPriceFloor).ToList();
        if (underpricedPlayers.Count > 0)
        {
            var msg = $"{underpricedPlayers.Count} player(s) have base prices below the tournament floor ({settings?.CurrencySymbol ?? "₹"}{minPriceFloor:N0}).";
            checks.Add(new PreflightCheckItem("PLAYER_PRICING", "Players", "Player Base Price Compliance", "FAIL", msg, "Update base prices in Player Registry"));
            blockingErrors.Add(msg);
        }
        else if (players.Count > 0)
        {
            checks.Add(new PreflightCheckItem("PLAYER_PRICING", "Players", "Player Base Price Compliance", "PASS", 
                "All registered players meet or exceed the minimum base price floor"));
        }

        // Mathematical squad feasibility check
        if (teams.Count >= 2 && minSquad >= 1)
        {
            if (players.Count < requiredMinPlayers)
            {
                var shortfall = requiredMinPlayers - players.Count;
                var msg = $"Mathematical Squad Shortfall: {teams.Count} teams require at least {minSquad} players each ({requiredMinPlayers} total players), but only {players.Count} players are available. You need at least {shortfall} more player(s) to fulfill minimum squad rules.";
                checks.Add(new PreflightCheckItem("SQUAD_FEASIBILITY", "Feasibility", "Mathematical Squad Feasibility", "FAIL", msg, $"Add at least {shortfall} more players"));
                blockingErrors.Add(msg);
            }
            else
            {
                checks.Add(new PreflightCheckItem("SQUAD_FEASIBILITY", "Feasibility", "Mathematical Squad Feasibility", "PASS", 
                    $"Sufficient players ({players.Count}) to fulfill minimum squad requirements ({requiredMinPlayers} required across {teams.Count} teams)"));
            }
        }

        // Photos Warning
        var missingPhotos = players.Count(p => string.IsNullOrWhiteSpace(p.PhotoUrl));
        if (missingPhotos > 0)
        {
            var msg = $"{missingPhotos} player(s) do not have photos uploaded. Default jersey avatar placeholders will be used during the auction.";
            checks.Add(new PreflightCheckItem("PLAYER_PHOTOS", "Players", "Player Photos", "WARN", msg));
            warnings.Add(msg);
        }
        else if (players.Count > 0)
        {
            checks.Add(new PreflightCheckItem("PLAYER_PHOTOS", "Players", "Player Photos", "PASS", 
                "All registered players have photo URLs"));
        }

        bool isReady = blockingErrors.Count == 0;

        var metrics = new PreflightMetrics(
            TotalTeams: teams.Count,
            MinimumSquadSize: minSquad,
            MaximumSquadSize: settings?.MaximumSquadSize ?? 16,
            RequiredPlayersForMinSquad: requiredMinPlayers,
            TotalPlayers: players.Count,
            TotalSets: sets.Count,
            EmptySetsCount: emptySets.Count,
            MinimumAcquisitionPrice: minPriceFloor,
            MinimumPurseRequiredPerTeam: minPurseFloor,
            TotalPurseAcrossTeams: teams.Sum(t => t.InitialPurse),
            PlayersWithoutPhotosCount: missingPhotos
        );

        return new PreflightReportDto(
            TournamentId: tournament.Id,
            TournamentName: tournament.Name,
            TournamentStatus: tournament.Status.ToString(),
            IsReadyForAuction: isReady,
            CriticalErrorsCount: blockingErrors.Count,
            WarningsCount: warnings.Count,
            Metrics: metrics,
            Checks: checks,
            BlockingErrors: blockingErrors,
            Warnings: warnings
        );
    }

    public async Task<PreflightReportDto> ApproveReadyForAuctionAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException($"Tournament status is '{tournament.Status}', cannot transition to READY");

        var report = await RunPreflightAsync(tournamentId, userId);
        if (!report.IsReadyForAuction)
        {
            throw new InvalidOperationException($"Cannot mark tournament READY FOR AUCTION: there are {report.CriticalErrorsCount} critical preflight validation error(s).");
        }

        tournament.Status = TournamentStatus.READY;
        tournament.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return report with { TournamentStatus = TournamentStatus.READY.ToString() };
    }

    public async Task<PreflightReportDto> ReturnToDraftAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.READY)
            throw new InvalidOperationException($"Cannot return to DRAFT from status '{tournament.Status}'");

        tournament.Status = TournamentStatus.DRAFT;
        tournament.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return await RunPreflightAsync(tournamentId, userId);
    }

    private async Task<Tournament> AssertCanManageTournamentAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await _db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
        if (tournament == null)
            throw new KeyNotFoundException("Tournament not found");

        var isOwner = tournament.OwnerUserId == userId;
        var isAuctioneer = await _db.TournamentMembers.AnyAsync(m =>
            m.TournamentId == tournamentId &&
            m.UserId == userId &&
            (m.Role == TournamentRole.OWNER || m.Role == TournamentRole.AUCTIONEER));

        if (!isOwner && !isAuctioneer)
            throw new UnauthorizedAccessException("Only tournament owners or auctioneers can update tournament status");

        return tournament;
    }

    private async Task AssertCanViewTournamentAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await _db.Tournaments.FirstOrDefaultAsync(t => t.Id == tournamentId);
        if (tournament == null)
            throw new KeyNotFoundException("Tournament not found");

        var hasAccess = tournament.OwnerUserId == userId ||
                        await _db.TournamentMembers.AnyAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (!hasAccess)
            throw new UnauthorizedAccessException("User does not have access to this tournament");
    }
}
