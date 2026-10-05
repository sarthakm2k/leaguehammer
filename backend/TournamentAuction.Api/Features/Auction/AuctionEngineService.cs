using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using TournamentAuction.Api.Hubs;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Auction;

public partial class AuctionEngineService : IAuctionEngineService
{
    private readonly TournamentAuctionDbContext _db;
    private readonly IHubContext<AuctionHub> _hub;
    private readonly ILogger<AuctionEngineService> _logger;

    public AuctionEngineService(TournamentAuctionDbContext db, IHubContext<AuctionHub> hub, ILogger<AuctionEngineService> logger)
    {
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    public async Task<AuctionStateDto> GetAuctionStateAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await _db.Tournaments
            .Include(t => t.Settings)
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
            throw new KeyNotFoundException($"Tournament with ID '{tournamentId}' was not found.");

        var member = tournament.Members.FirstOrDefault(m => m.UserId == userId);
        if (member == null && tournament.OwnerUserId != userId)
            throw new UnauthorizedAccessException("You are not a member of this tournament.");

        var session = await _db.AuctionSessions
            .Include(s => s.CurrentSet)
            .Include(s => s.CurrentLot)
                .ThenInclude(l => l!.Player)
            .Include(s => s.CurrentLot)
                .ThenInclude(l => l!.PlayerSet)
            .Include(s => s.CurrentLot)
                .ThenInclude(l => l!.WinningTeam)
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId);

        if (session == null)
        {
            // If no session created yet, create a default READY session representation
            return await BuildInitialAuctionStateAsync(tournament);
        }

        return await BuildAuctionStateAsync(tournament, session);
    }

    public async Task<AuctionStateDto> StartAuctionAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);

        if (tournament.Status != TournamentStatus.READY && tournament.Status != TournamentStatus.LIVE)
        {
            throw new InvalidOperationException(
                $"Tournament must be in READY status before starting the auction. Current status: '{tournament.Status}'.");
        }

        var session = await _db.AuctionSessions
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId);

        if (session == null)
        {
            session = new AuctionSession
            {
                TournamentId = tournamentId,
                Status = AuctionSessionStatus.LIVE,
                StartedAtUtc = DateTime.UtcNow,
                Version = 1
            };
            _db.AuctionSessions.Add(session);
        }
        else
        {
            session.Status = AuctionSessionStatus.LIVE;
            session.StartedAtUtc ??= DateTime.UtcNow;
            session.PausedAtUtc = null;
            session.Version++;
            session.UpdatedAtUtc = DateTime.UtcNow;
        }

        tournament.Status = TournamentStatus.LIVE;
        tournament.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            null,
            AuctionEventTypes.AuctionStarted,
            userId,
            new { message = "Live auction session started by organizer." }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session);
    }

    public async Task<AuctionStateDto> PauseAuctionAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        if (session.Status != AuctionSessionStatus.LIVE)
            throw new InvalidOperationException($"Cannot pause auction: session is currently in '{session.Status}' status.");

        session.Status = AuctionSessionStatus.PAUSED;
        session.PausedAtUtc = DateTime.UtcNow;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            session.CurrentLotId,
            AuctionEventTypes.AuctionPaused,
            userId,
            new { message = "Auction paused by organizer." }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session);
    }

    public async Task<AuctionStateDto> ResumeAuctionAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        if (session.Status != AuctionSessionStatus.PAUSED)
            throw new InvalidOperationException($"Cannot resume auction: session is currently in '{session.Status}' status.");

        session.Status = AuctionSessionStatus.LIVE;
        session.PausedAtUtc = null;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            session.CurrentLotId,
            AuctionEventTypes.AuctionResumed,
            userId,
            new { message = "Auction resumed by organizer." }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session);
    }

    public async Task<AuctionStateDto> StartSetAsync(Guid tournamentId, StartSetRequest request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);

        if (session.CurrentLotId != null)
        {
            var currentLot = await _db.AuctionLots.FindAsync(session.CurrentLotId);
            if (currentLot != null && currentLot.Status == AuctionLotStatus.ON_AUCTION)
            {
                throw new InvalidOperationException(
                    "A player is currently on auction. You must resolve (SOLD / UNSOLD) the active player before starting another set.");
            }
        }

        // Verify that the requested set belongs to this tournament
        var set = await _db.PlayerSets
            .FirstOrDefaultAsync(s => s.Id == request.SetId && s.TournamentId == tournamentId);

        if (set == null)
            throw new KeyNotFoundException($"Player set with ID '{request.SetId}' was not found in this tournament.");

        if (session.IsUnsoldRound)
            throw new InvalidOperationException("Normal sets cannot restart after the Final Unsold Round begins.");
        if (session.CurrentSetId != null && session.CurrentSetId != set.Id)
            throw new InvalidOperationException("Complete the active set before starting another set.");
        var completedSets = await GetCompletedSetIdsAsync(session.Id);
        var nextSet = await _db.PlayerSets.Where(s => s.TournamentId == tournamentId && !completedSets.Contains(s.Id))
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Id).FirstOrDefaultAsync();
        if (nextSet?.Id != set.Id)
            throw new InvalidOperationException("Start the next unfinished player set in tournament order.");

        // Check if lots already exist for this set in this session
        var existingLots = await _db.AuctionLots
            .Where(l => l.AuctionSessionId == session.Id && l.PlayerSetId == request.SetId && l.AttemptNumber == 1)
            .OrderBy(l => l.DrawPosition)
            .ToListAsync();

        if (!existingLots.Any())
        {
            // Retrieve available players in this set
            var players = await _db.Players
                .Where(p => p.TournamentId == tournamentId && p.PlayerSetId == request.SetId && p.Status == "AVAILABLE")
                .ToListAsync();

            if (!players.Any())
            {
                throw new InvalidOperationException(
                    $"No available players found in player set '{set.Name}'.");
            }

            // Server-side randomization (Fisher-Yates) and persisted DrawPosition
            var shuffled = players.ToList();
            Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(shuffled));
            for (int i = 0; i < shuffled.Count; i++)
            {
                var lot = new AuctionLot
                {
                    AuctionSessionId = session.Id,
                    TournamentId = tournamentId,
                    PlayerId = shuffled[i].Id,
                    PlayerSetId = set.Id,
                    AttemptNumber = 1,
                    DrawPosition = i + 1,
                    Status = AuctionLotStatus.PENDING
                };
                _db.AuctionLots.Add(lot);
            }
        }

        session.CurrentSetId = set.Id;
        session.IsUnsoldRound = false;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            null,
            AuctionEventTypes.SetStarted,
            userId,
            new { setId = set.Id, setName = set.Name }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session);
    }

    public async Task<AuctionStateDto> RevealNextPlayerAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);

        if (session.CurrentLotId != null)
        {
            var activeLot = await _db.AuctionLots
                .Include(l => l.Player)
                .FirstOrDefaultAsync(l => l.Id == session.CurrentLotId);

            if (activeLot != null && activeLot.Status == AuctionLotStatus.ON_AUCTION)
            {
                throw new InvalidOperationException(
                    $"Player '{activeLot.Player.Name}' is already ON AUCTION. Please record SOLD or UNSOLD before revealing the next player.");
            }
        }

        if (session.CurrentSetId == null && !session.IsUnsoldRound)
        {
            throw new InvalidOperationException("No player set is currently active. Please start a set first.");
        }

        // Fetch the next pending lot in current set / unsold round ordered by DrawPosition
        var nextLot = await _db.AuctionLots
            .Include(l => l.Player)
            .Include(l => l.PlayerSet)
            .Where(l => l.AuctionSessionId == session.Id &&
                        (session.IsUnsoldRound ? l.AttemptNumber >= 2 : l.PlayerSetId == session.CurrentSetId && l.AttemptNumber == 1) &&
                        l.Status == AuctionLotStatus.PENDING)
            .OrderBy(l => l.AttemptNumber).ThenBy(l => l.DrawPosition)
            .FirstOrDefaultAsync();

        if (nextLot == null)
        {
            throw new InvalidOperationException(
                session.IsUnsoldRound
                    ? "All players in the final unsold round have been auctioned."
                    : "All players in this set have been revealed. Please complete the set to proceed.");
        }

        nextLot.Status = AuctionLotStatus.ON_AUCTION;
        nextLot.RevealedAtUtc = DateTime.UtcNow;
        nextLot.UpdatedAtUtc = DateTime.UtcNow;

        nextLot.Player.Status = "ON_AUCTION";
        nextLot.Player.UpdatedAtUtc = DateTime.UtcNow;

        session.CurrentLotId = nextLot.Id;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            nextLot.Id,
            AuctionEventTypes.PlayerRevealed,
            userId,
            new
            {
                lotId = nextLot.Id,
                playerId = nextLot.PlayerId,
                playerName = nextLot.Player.Name,
                basePrice = nextLot.Player.BasePrice,
                drawPosition = nextLot.DrawPosition,
                attemptNumber = nextLot.AttemptNumber
            }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session, "PlayerRevealed", nextLot.Id);
    }

    public async Task<AuctionStateDto> SellCurrentPlayerAsync(Guid tournamentId, SellPlayerRequest request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);

        // Concurrency & Double-Click validation
        if (session.CurrentLotId != request.LotId)
        {
            throw new InvalidOperationException(
                "Lot mismatch or duplicate request. The specified lot is not currently active on the auction podium.");
        }

        var lot = await _db.AuctionLots
            .Include(l => l.Player)
            .FirstOrDefaultAsync(l => l.Id == request.LotId && l.AuctionSessionId == session.Id);

        if (lot == null || lot.Status != AuctionLotStatus.ON_AUCTION)
        {
            throw new InvalidOperationException("Player lot is not currently ON AUCTION. It may have already been resolved.");
        }

        // Team verification
        var team = await _db.Teams
            .FirstOrDefaultAsync(t => t.Id == request.WinningTeamId && t.TournamentId == tournamentId);

        if (team == null)
            throw new KeyNotFoundException($"Winning team with ID '{request.WinningTeamId}' does not belong to this tournament.");

        var settings = tournament.Settings ?? throw new InvalidOperationException("Tournament auction settings are missing.");

        // Price validation
        if (request.FinalPrice < lot.Player.BasePrice)
        {
            throw new InvalidOperationException(
                $"Final price {settings.CurrencySymbol}{request.FinalPrice:N0} cannot be less than the player's base price ({settings.CurrencySymbol}{lot.Player.BasePrice:N0}).");
        }

        if (request.FinalPrice < settings.MinimumAcquisitionPrice)
        {
            throw new InvalidOperationException(
                $"Final price {settings.CurrencySymbol}{request.FinalPrice:N0} cannot be below the tournament minimum acquisition price ({settings.CurrencySymbol}{settings.MinimumAcquisitionPrice:N0}).");
        }

        // Squad size validation
        var currentSquadCount = await _db.AuctionLots
            .CountAsync(l => l.TournamentId == tournamentId && l.WinningTeamId == team.Id && l.Status == AuctionLotStatus.SOLD && l.Id != lot.Id);

        if (currentSquadCount + 1 > settings.MaximumSquadSize)
        {
            throw new InvalidOperationException(
                $"{team.Name} already has {currentSquadCount} player(s) and cannot exceed the maximum squad limit of {settings.MaximumSquadSize}.");
        }

        // Financial reserve calculations (Section 22 of Master Spec)
        var totalSpentByTeam = await _db.AuctionLots
            .Where(l => l.TournamentId == tournamentId && l.WinningTeamId == team.Id && l.Status == AuctionLotStatus.SOLD && l.Id != lot.Id)
            .SumAsync(l => l.FinalPrice ?? 0);

        var remainingPurse = team.InitialPurse - totalSpentByTeam;
        var newSquadSize = currentSquadCount + 1;
        var remainingSlotsToMinSquad = Math.Max(0, settings.MinimumSquadSize - newSquadSize);
        var requiredReserve = remainingSlotsToMinSquad * settings.MinimumAcquisitionPrice;
        var maximumAllowedBid = remainingPurse - requiredReserve;

        if (request.FinalPrice > maximumAllowedBid)
        {
            throw new InvalidOperationException(
                $"{team.Name} cannot spend {settings.CurrencySymbol}{request.FinalPrice:N0} on this player. " +
                $"The maximum allowed purchase is {settings.CurrencySymbol}{maximumAllowedBid:N0} because " +
                $"{settings.CurrencySymbol}{requiredReserve:N0} must remain reserved to acquire remaining players for the minimum squad requirement ({settings.MinimumSquadSize} players).");
        }

        await ValidateRemainingPlayerPurchasesAsync(tournament, lot.PlayerId, team.Id, request.FinalPrice, lot.Id);

        // Execute sale commit
        lot.Status = AuctionLotStatus.SOLD;
        lot.WinningTeamId = team.Id;
        lot.FinalPrice = request.FinalPrice;
        lot.CompletedAtUtc = DateTime.UtcNow;
        lot.UpdatedAtUtc = DateTime.UtcNow;

        lot.Player.Status = "SOLD";
        lot.Player.UpdatedAtUtc = DateTime.UtcNow;

        session.CurrentLotId = null;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            lot.Id,
            AuctionEventTypes.PlayerSold,
            userId,
            new
            {
                lotId = lot.Id,
                playerId = lot.PlayerId,
                playerName = lot.Player.Name,
                winningTeamId = team.Id,
                teamName = team.Name,
                finalPrice = request.FinalPrice,
                teamRemainingPurse = remainingPurse - request.FinalPrice,
                newSquadSize
            }
        );

        await ContinueUnsoldRoundsAsync(tournament, session, userId);
        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session, "PlayerSold", lot.Id);
    }

    public async Task<AuctionStateDto> MarkCurrentPlayerUnsoldAsync(Guid tournamentId, MarkUnsoldRequest request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);

        if (session.CurrentLotId != request.LotId)
        {
            throw new InvalidOperationException(
                "Lot mismatch or duplicate request. The specified lot is not currently active on the auction podium.");
        }

        var lot = await _db.AuctionLots
            .Include(l => l.Player)
            .FirstOrDefaultAsync(l => l.Id == request.LotId && l.AuctionSessionId == session.Id);

        if (lot == null || lot.Status != AuctionLotStatus.ON_AUCTION)
        {
            throw new InvalidOperationException("Player lot is not currently ON AUCTION.");
        }

        lot.Status = AuctionLotStatus.UNSOLD;
        lot.CompletedAtUtc = DateTime.UtcNow;
        lot.UpdatedAtUtc = DateTime.UtcNow;

        lot.Player.Status = lot.AttemptNumber >= 2 && tournament.Settings?.SellAllPlayers != true ? "FINAL_UNSOLD" : "UNSOLD";
        lot.Player.UpdatedAtUtc = DateTime.UtcNow;

        session.CurrentLotId = null;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            lot.Id,
            AuctionEventTypes.PlayerUnsold,
            userId,
            new
            {
                lotId = lot.Id,
                playerId = lot.PlayerId,
                playerName = lot.Player.Name,
                attemptNumber = lot.AttemptNumber,
                isFinal = lot.AttemptNumber >= 2 && tournament.Settings?.SellAllPlayers != true
            }
        );

        await ContinueUnsoldRoundsAsync(tournament, session, userId);
        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session, "PlayerUnsold", lot.Id);
    }

    public async Task<SetSummaryDto> CompleteSetAsync(Guid tournamentId, Guid setId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);
        if (session.IsUnsoldRound || session.CurrentSetId != setId)
            throw new InvalidOperationException("Only the active normal set can be completed.");

        var set = await _db.PlayerSets
            .FirstOrDefaultAsync(s => s.Id == setId && s.TournamentId == tournamentId);

        if (set == null)
            throw new KeyNotFoundException($"Player set with ID '{setId}' was not found.");

        // Check that all lots in set have been resolved
        var unresolvedCount = await _db.AuctionLots
            .CountAsync(l => l.AuctionSessionId == session.Id && l.PlayerSetId == setId &&
                             (l.Status == AuctionLotStatus.PENDING || l.Status == AuctionLotStatus.ON_AUCTION));

        if (unresolvedCount > 0)
        {
            throw new InvalidOperationException(
                $"Cannot complete set '{set.Name}': there are still {unresolvedCount} unresolved player(s) in this set.");
        }

        var summary = await CalculateSetSummaryAsync(session.Id, setId, set.Name);

        session.CurrentSetId = null;
        session.CurrentLotId = null;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            null,
            AuctionEventTypes.SetCompleted,
            userId,
            summary
        );

        await _db.SaveChangesAsync();

        await PublishChangeAsync(tournament, session, "SetCompleted", summary: summary);
        return summary;
    }

    public async Task<AuctionStateDto> StartUnsoldRoundAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);
        ValidateSessionIsLive(session);
        await ValidateNormalSetsCompletedAsync(tournamentId, session);
        if (session.IsUnsoldRound && tournament.Settings?.SellAllPlayers != true)
            throw new InvalidOperationException("The Final Unsold Round has already started. Continue its persisted draw.");
        if (!await QueueUnsoldRoundAsync(tournament, session, userId))
            throw new InvalidOperationException("No eligible unsold players remain for re-auction.");
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return await PublishChangeAsync(tournament, session);
    }

    private async Task<bool> QueueUnsoldRoundAsync(Tournament tournament, AuctionSession session, Guid userId)
    {
        // Materialize tracked lots so the result being committed participates in the round-boundary check.
        var lots = await _db.AuctionLots.Where(l => l.AuctionSessionId == session.Id).ToListAsync();
        if (lots.Any(l => l.Status is AuctionLotStatus.PENDING or AuctionLotStatus.ON_AUCTION))
            return false;
        var eligible = lots.GroupBy(l => l.PlayerId).Select(g => g.OrderByDescending(l => l.AttemptNumber).First())
            .Where(l => l.Status == AuctionLotStatus.UNSOLD).Select(l => l.PlayerId).ToList();
        if (eligible.Count == 0) return false;
        var attempt = lots.Max(l => l.AttemptNumber) + 1;
        if (attempt > 2 && tournament.Settings?.SellAllPlayers != true) return false;
        var players = await _db.Players.Where(p => eligible.Contains(p.Id)).ToListAsync();
        Random.Shared.Shuffle(System.Runtime.InteropServices.CollectionsMarshal.AsSpan(players));
        for (var i = 0; i < players.Count; i++)
            _db.AuctionLots.Add(new AuctionLot {
                AuctionSessionId = session.Id, TournamentId = tournament.Id, PlayerId = players[i].Id,
                PlayerSetId = players[i].PlayerSetId, AttemptNumber = attempt, DrawPosition = i + 1,
                Status = AuctionLotStatus.PENDING
            });
        session.IsUnsoldRound = true;
        session.CurrentSetId = null;
        session.CurrentLotId = null;
        await AddAuditEventAsync(session.Id, tournament.Id, null, AuctionEventTypes.UnsoldRoundStarted, userId,
            new { unsoldPlayersCount = players.Count, attemptNumber = attempt, unsoldRoundNumber = attempt - 1 });
        return true;
    }

    private async Task ContinueUnsoldRoundsAsync(Tournament tournament, AuctionSession session, Guid userId)
    {
        if (tournament.Settings?.SellAllPlayers == true && session.IsUnsoldRound)
            await QueueUnsoldRoundAsync(tournament, session, userId);
    }

    public async Task<AuctionStateDto> CorrectAuctionResultAsync(Guid tournamentId, CorrectResultRequest request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        if (session.Status != AuctionSessionStatus.LIVE && session.Status != AuctionSessionStatus.PAUSED)
            throw new InvalidOperationException("Results can only be corrected during a live or paused auction.");
        if (session.CurrentLotId != null)
            throw new InvalidOperationException("Resolve the active player before correcting a result.");
        if (string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length > 500)
            throw new InvalidOperationException("A correction audit reason of 1 to 500 characters is required.");
        if (request.NewFinalPrice < 1 || request.NewFinalPrice > 10000000000)
            throw new InvalidOperationException("The correction price is outside the supported range.");

        var lot = await _db.AuctionLots
            .Include(l => l.Player)
            .FirstOrDefaultAsync(l => l.Id == request.LotId && l.AuctionSessionId == session.Id);

        if (lot == null)
            throw new KeyNotFoundException($"Auction lot with ID '{request.LotId}' was not found.");

        if (lot.Status != AuctionLotStatus.SOLD && lot.Status != AuctionLotStatus.UNSOLD)
            throw new InvalidOperationException("Only completed (SOLD or UNSOLD) lots can have their results corrected.");

        var latestResultId = await _db.AuctionLots.Where(l => l.AuctionSessionId == session.Id &&
            (l.Status == AuctionLotStatus.SOLD || l.Status == AuctionLotStatus.UNSOLD))
            .OrderByDescending(l => l.CompletedAtUtc).ThenBy(l => l.Id).Select(l => l.Id).FirstOrDefaultAsync();
        if (latestResultId != lot.Id || await _db.AuctionLots.AnyAsync(l => l.AuctionSessionId == session.Id &&
            l.PlayerId == lot.PlayerId && l.AttemptNumber > lot.AttemptNumber))
            throw new InvalidOperationException("Only the most recent result without a later attempt can be corrected.");

        var newTeam = await _db.Teams
            .FirstOrDefaultAsync(t => t.Id == request.NewWinningTeamId && t.TournamentId == tournamentId);

        if (newTeam == null)
            throw new KeyNotFoundException($"Target team with ID '{request.NewWinningTeamId}' was not found.");

        var settings = tournament.Settings ?? throw new InvalidOperationException("Tournament settings are missing.");

        if (request.NewFinalPrice < Math.Max(lot.Player.BasePrice, settings.MinimumAcquisitionPrice))
        {
            throw new InvalidOperationException(
                $"New final price cannot be less than the player's base price ({settings.CurrencySymbol}{lot.Player.BasePrice:N0}).");
        }

        // Validate new team finances and squad limits
        var newTeamCurrentSquad = await _db.AuctionLots
            .CountAsync(l => l.TournamentId == tournamentId && l.WinningTeamId == newTeam.Id && l.Status == AuctionLotStatus.SOLD && l.Id != lot.Id);

        if (newTeamCurrentSquad + 1 > settings.MaximumSquadSize)
        {
            throw new InvalidOperationException(
                $"{newTeam.Name} would exceed maximum squad limit ({settings.MaximumSquadSize}) with this correction.");
        }

        var newTeamSpent = await _db.AuctionLots
            .Where(l => l.TournamentId == tournamentId && l.WinningTeamId == newTeam.Id && l.Status == AuctionLotStatus.SOLD && l.Id != lot.Id)
            .SumAsync(l => l.FinalPrice ?? 0);

        var remainingPurse = newTeam.InitialPurse - newTeamSpent;
        var remainingSlotsToMinSquad = Math.Max(0, settings.MinimumSquadSize - (newTeamCurrentSquad + 1));
        var requiredReserve = remainingSlotsToMinSquad * settings.MinimumAcquisitionPrice;
        var maxAllowedBid = remainingPurse - requiredReserve;

        if (request.NewFinalPrice > maxAllowedBid)
        {
            throw new InvalidOperationException(
                $"{newTeam.Name} cannot afford {settings.CurrencySymbol}{request.NewFinalPrice:N0}. " +
                $"Maximum allowed purchase is {settings.CurrencySymbol}{maxAllowedBid:N0} to protect squad reserve.");
        }

        await ValidateRemainingPlayerPurchasesAsync(tournament, lot.PlayerId, newTeam.Id, request.NewFinalPrice, lot.Id);

        var oldTeamId = lot.WinningTeamId;
        var oldPrice = lot.FinalPrice;
        var oldStatus = lot.Status;

        // Apply correction
        lot.Status = AuctionLotStatus.SOLD;
        lot.WinningTeamId = newTeam.Id;
        lot.FinalPrice = request.NewFinalPrice;
        lot.UpdatedAtUtc = DateTime.UtcNow;

        lot.Player.Status = "SOLD";
        lot.Player.UpdatedAtUtc = DateTime.UtcNow;

        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            lot.Id,
            AuctionEventTypes.ResultCorrected,
            userId,
            new
            {
                lotId = lot.Id,
                playerId = lot.PlayerId,
                playerName = lot.Player.Name,
                oldTeamId,
                oldPrice,
                oldStatus = oldStatus.ToString(),
                newTeamId = newTeam.Id,
                newTeamName = newTeam.Name,
                newPrice = request.NewFinalPrice,
                newStatus = AuctionLotStatus.SOLD.ToString(),
                attemptNumber = lot.AttemptNumber,
                reason = request.Reason.Trim()
            }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session, "ResultCorrected", lot.Id, request.Reason.Trim());
    }

    public async Task<AuctionStateDto> CompleteAuctionAsync(Guid tournamentId, CompleteAuctionRequest? request, Guid userId)
    {
        var tournament = await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: true);
        var session = await GetActiveSessionAsync(tournamentId);

        ValidateSessionIsLive(session);
        await ValidateNormalSetsCompletedAsync(tournamentId, session);
        if (!string.IsNullOrWhiteSpace(request?.OverrideReason) &&
            tournament.OwnerUserId != userId && !tournament.Members.Any(m => m.UserId == userId && m.Role == TournamentRole.OWNER))
            throw new UnauthorizedAccessException("Only a tournament owner may override squad shortfalls.");
        if (request?.OverrideReason?.Length > 500)
            throw new InvalidOperationException("The override reason must not exceed 500 characters.");

        // 1. Verify regular sets are all completed
        var pendingLots = await _db.AuctionLots
            .CountAsync(l => l.AuctionSessionId == session.Id &&
                             (l.Status == AuctionLotStatus.PENDING || l.Status == AuctionLotStatus.ON_AUCTION));

        if (pendingLots > 0)
        {
            throw new InvalidOperationException(
                $"Cannot complete auction: there are still {pendingLots} pending or active auction lot(s).");
        }

        if (tournament.Settings?.SellAllPlayers == true && await _db.Players.AnyAsync(p => p.TournamentId == tournamentId && p.Status != "SOLD"))
            throw new InvalidOperationException("Sell all players is enabled. Every player must be SOLD before completing the auction; an override cannot bypass this rule.");

        // 2. Check if unsold round was required and not conducted
        var unresolvedUnsoldCount = await _db.AuctionLots
            .Where(l => l.AuctionSessionId == session.Id && l.AttemptNumber == 1 && l.Status == AuctionLotStatus.UNSOLD)
            .Where(l => !_db.AuctionLots.Any(a2 => a2.AuctionSessionId == session.Id && a2.PlayerId == l.PlayerId && a2.AttemptNumber == 2))
            .CountAsync();

        if (unresolvedUnsoldCount > 0)
        {
            throw new InvalidOperationException(
                $"Cannot complete auction: {unresolvedUnsoldCount} unsold player(s) have not received their mandatory Final Unsold Round attempt.");
        }

        // 3. Verify squad sizes meet MinimumSquadSize
        var settings = tournament.Settings ?? throw new InvalidOperationException("Tournament settings are missing.");
        var teams = await _db.Teams.Where(t => t.TournamentId == tournamentId).ToListAsync();

        var deficientTeams = new List<string>();
        foreach (var team in teams)
        {
            var squadCount = await _db.AuctionLots
                .CountAsync(l => l.TournamentId == tournamentId && l.WinningTeamId == team.Id && l.Status == AuctionLotStatus.SOLD);

            if (squadCount < settings.MinimumSquadSize)
            {
                deficientTeams.Add($"{team.Name} ({squadCount}/{settings.MinimumSquadSize})");
            }
        }

        if (deficientTeams.Any() && string.IsNullOrWhiteSpace(request?.OverrideReason))
        {
            throw new InvalidOperationException(
                $"Cannot complete auction: The following team(s) did not reach the minimum squad size of {settings.MinimumSquadSize}: {string.Join(", ", deficientTeams)}. " +
                "An explicit override reason is required to complete the auction with squad shortfalls.");
        }

        session.Status = AuctionSessionStatus.COMPLETED;
        session.CompletedAtUtc = DateTime.UtcNow;
        session.Version++;
        session.UpdatedAtUtc = DateTime.UtcNow;

        tournament.Status = TournamentStatus.COMPLETED;
        tournament.UpdatedAtUtc = DateTime.UtcNow;

        await AddAuditEventAsync(
            session.Id,
            tournamentId,
            null,
            AuctionEventTypes.AuctionCompleted,
            userId,
            new
            {
                overrideReason = request?.OverrideReason,
                hasDeficiencies = deficientTeams.Any(),
                deficientTeams
            }
        );

        await _db.SaveChangesAsync();

        return await PublishChangeAsync(tournament, session);
    }

    public async Task<List<AuctionEventDto>> GetAuctionEventsAsync(Guid tournamentId, Guid userId, int take = 50, int skip = 0)
    {
        var tournament = await _db.Tournaments
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
            throw new KeyNotFoundException($"Tournament with ID '{tournamentId}' was not found.");

        var member = tournament.Members.FirstOrDefault(m => m.UserId == userId);
        if (member == null && tournament.OwnerUserId != userId)
            throw new UnauthorizedAccessException("Unauthorized access to auction events.");

        var events = await _db.AuctionEvents
            .Include(e => e.User)
            .Where(e => e.TournamentId == tournamentId)
            .OrderByDescending(e => e.CreatedAtUtc)
            .ThenBy(e => e.Id)
            .Skip(Math.Max(0, skip))
            .Take(Math.Clamp(take, 1, 100))
            .Select(e => new AuctionEventDto(
                e.Id,
                e.AuctionSessionId,
                e.TournamentId,
                e.AuctionLotId,
                e.EventType,
                e.UserId,
                e.User.FullName,
                e.EventData,
                e.CreatedAtUtc
            ))
            .ToListAsync();

        return events;
    }

    #region Helper Methods

    public async Task<AuctionHistoryDto> GetAuctionHistoryAsync(Guid tournamentId, Guid userId)
    {
        await GetTournamentWithAuthAsync(tournamentId, userId, requireOrganizer: false);
        var lots = await _db.AuctionLots.Include(l => l.Player).Include(l => l.PlayerSet).Include(l => l.WinningTeam)
            .Where(l => l.TournamentId == tournamentId && (l.Status == AuctionLotStatus.SOLD || l.Status == AuctionLotStatus.UNSOLD))
            .OrderByDescending(l => l.CompletedAtUtc).ThenBy(l => l.Id).ToListAsync();
        return new(lots.Select(MapLot).ToList());
    }

    private async Task<List<Guid>> GetCompletedSetIdsAsync(Guid sessionId)
    {
        var events = await _db.AuctionEvents.Where(e => e.AuctionSessionId == sessionId && e.EventType == AuctionEventTypes.SetCompleted)
            .Select(e => e.EventData).ToListAsync();
        return events.Select(json => JsonSerializer.Deserialize<SetSummaryDto>(json)!.SetId).Distinct().ToList();
    }

    private async Task ValidateNormalSetsCompletedAsync(Guid tournamentId, AuctionSession session)
    {
        var completed = await GetCompletedSetIdsAsync(session.Id);
        if (session.CurrentSetId != null || await _db.PlayerSets.AnyAsync(s => s.TournamentId == tournamentId && !completed.Contains(s.Id)))
            throw new InvalidOperationException("Complete all normal player sets before the Final Unsold Round or auction completion.");
    }

    private async Task<Tournament> GetTournamentWithAuthAsync(Guid tournamentId, Guid userId, bool requireOrganizer)
    {
        var tournament = await _db.Tournaments
            .Include(t => t.Settings)
            .Include(t => t.Members)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
            throw new KeyNotFoundException($"Tournament with ID '{tournamentId}' was not found.");

        if (tournament.OwnerUserId == userId)
            return tournament;

        var member = tournament.Members.FirstOrDefault(m => m.UserId == userId);
        if (member == null)
            throw new UnauthorizedAccessException("You are not a member of this tournament.");

        if (requireOrganizer && member.Role != TournamentRole.OWNER && member.Role != TournamentRole.AUCTIONEER)
            throw new UnauthorizedAccessException("Only tournament OWNER or AUCTIONEER can perform this auction action.");

        return tournament;
    }

    private async Task<AuctionSession> GetActiveSessionAsync(Guid tournamentId)
    {
        var session = await _db.AuctionSessions
            .Include(s => s.CurrentSet)
            .Include(s => s.CurrentLot)
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId);

        if (session == null)
            throw new InvalidOperationException("No auction session has been started for this tournament. Please start the auction first.");

        return session;
    }

    private static void ValidateSessionIsLive(AuctionSession session)
    {
        if (session.Status != AuctionSessionStatus.LIVE)
        {
            throw new InvalidOperationException(
                $"Auction is currently {session.Status}. It must be in LIVE status to execute this command.");
        }
    }

    private async Task AddAuditEventAsync(
        Guid sessionId,
        Guid tournamentId,
        Guid? lotId,
        string eventType,
        Guid userId,
        object eventData)
    {
        var evt = new AuctionEvent
        {
            AuctionSessionId = sessionId,
            TournamentId = tournamentId,
            AuctionLotId = lotId,
            EventType = eventType,
            UserId = userId,
            EventData = JsonSerializer.Serialize(eventData),
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.AuctionEvents.Add(evt);
    }

    private async Task<SetSummaryDto> CalculateSetSummaryAsync(Guid sessionId, Guid setId, string setName)
    {
        var lots = await _db.AuctionLots
            .Include(l => l.Player)
            .Include(l => l.WinningTeam)
            .Where(l => l.AuctionSessionId == sessionId && l.PlayerSetId == setId && l.AttemptNumber == 1)
            .ToListAsync();

        var soldLots = lots.Where(l => l.Status == AuctionLotStatus.SOLD).ToList();
        var unsoldLots = lots.Where(l => l.Status == AuctionLotStatus.UNSOLD).ToList();
        var remainingLots = lots.Where(l => l.Status == AuctionLotStatus.PENDING || l.Status == AuctionLotStatus.ON_AUCTION).ToList();

        var highestSold = soldLots.OrderByDescending(l => l.FinalPrice ?? 0).FirstOrDefault();

        return new SetSummaryDto(
            setId,
            setName,
            lots.Count,
            soldLots.Count,
            unsoldLots.Count,
            remainingLots.Count,
            soldLots.Sum(l => l.FinalPrice ?? 0),
            highestSold?.Player?.Name,
            highestSold?.FinalPrice,
            highestSold?.WinningTeam?.Name
        );
    }

    private async Task<AuctionStateDto> BuildInitialAuctionStateAsync(Tournament tournament)
    {
        var standings = await CalculateTeamStandingsAsync(tournament.Id, tournament.Settings!);
        var totalSets = await _db.PlayerSets.CountAsync(s => s.TournamentId == tournament.Id);
        var totalPlayers = await _db.Players.CountAsync(p => p.TournamentId == tournament.Id);

        return new AuctionStateDto(
            tournament.Id,
            tournament.Name,
            tournament.Status.ToString(),
            Guid.Empty,
            AuctionSessionStatus.READY.ToString(),
            1,
            false,
            null,
            null,
            null,
            totalSets,
            0,
            totalPlayers,
            0,
            0,
            totalPlayers,
            standings.Sum(s => s.InitialPurse),
            0,
            standings,
            null,
            null,
            null,
            null,
            tournament.Settings!.CurrencyCode,
            tournament.Settings.CurrencySymbol,
            tournament.Settings.DefaultBidIncrement,
            SellAllPlayers: tournament.Settings.SellAllPlayers
        );
    }

    private async Task<AuctionStateDto> BuildAuctionStateAsync(Tournament tournament, AuctionSession session)
    {
        var settings = tournament.Settings ?? new TournamentSettings();
        var standings = await CalculateTeamStandingsAsync(tournament.Id, settings);

        // Fetch current lot DTO if exists
        AuctionLotDto? currentLotDto = null;
        if (session.CurrentLotId != null)
        {
            var lot = await _db.AuctionLots
                .Include(l => l.Player)
                .Include(l => l.PlayerSet)
                .Include(l => l.WinningTeam)
                .FirstOrDefaultAsync(l => l.Id == session.CurrentLotId);

            if (lot != null)
            {
                currentLotDto = MapLot(lot);
            }
        }

        // Calculate Set Summary if a set is active
        SetSummaryDto? currentSetSummary = null;
        if (session.CurrentSetId != null)
        {
            var setName = session.CurrentSet?.Name ?? (await _db.PlayerSets.FindAsync(session.CurrentSetId))?.Name ?? "Active Set";
            currentSetSummary = await CalculateSetSummaryAsync(session.Id, session.CurrentSetId.Value, setName);
        }

        var totalSets = await _db.PlayerSets.CountAsync(s => s.TournamentId == tournament.Id);
        var totalPlayers = await _db.Players.CountAsync(p => p.TournamentId == tournament.Id);

        var totalSold = await _db.AuctionLots
            .CountAsync(l => l.AuctionSessionId == session.Id && l.Status == AuctionLotStatus.SOLD);

        var totalUnsold = await _db.Players
            .CountAsync(p => p.TournamentId == tournament.Id && (p.Status == "UNSOLD" || p.Status == "FINAL_UNSOLD"));

        var totalPending = await _db.Players
            .CountAsync(p => p.TournamentId == tournament.Id && (p.Status == "AVAILABLE" || p.Status == "ON_AUCTION"));
        var completedSetIds = await GetCompletedSetIdsAsync(session.Id);
        var unsoldRoundRemaining = await _db.AuctionLots.CountAsync(l => l.AuctionSessionId == session.Id &&
            l.AttemptNumber >= 2 && (l.Status == AuctionLotStatus.PENDING || l.Status == AuctionLotStatus.ON_AUCTION));
        var currentAttempt = await _db.AuctionLots.Where(l => l.AuctionSessionId == session.Id)
            .Select(l => (int?)l.AttemptNumber).MaxAsync() ?? 1;
        if (session.IsUnsoldRound) totalPending = unsoldRoundRemaining;

        var totalSpent = standings.Sum(s => s.TotalSpent);

        var lastLot = await _db.AuctionLots.Include(l => l.Player).Include(l => l.PlayerSet)
            .Include(l => l.WinningTeam)
            .Where(l => l.AuctionSessionId == session.Id && (l.Status == AuctionLotStatus.SOLD || l.Status == AuctionLotStatus.UNSOLD))
            .OrderByDescending(l => l.CompletedAtUtc).ThenBy(l => l.Id).FirstOrDefaultAsync();
        var lastResult = lastLot == null ? null : MapLot(lastLot);

        return new AuctionStateDto(
            tournament.Id,
            tournament.Name,
            tournament.Status.ToString(),
            session.Id,
            session.Status.ToString(),
            session.Version,
            session.IsUnsoldRound,
            session.CurrentSetId,
            currentSetSummary?.SetName ?? (session.IsUnsoldRound ? (settings.SellAllPlayers ? $"Unsold Round {currentAttempt - 1}" : "Final Unsold Round") : null),
            currentLotDto,
            totalSets,
            completedSetIds.Count,
            totalPlayers,
            totalSold,
            totalUnsold,
            totalPending,
            standings.Sum(s => s.InitialPurse),
            totalSpent,
            standings,
            currentSetSummary,
            session.StartedAtUtc,
            session.PausedAtUtc,
            session.CompletedAtUtc,
            settings.CurrencyCode,
            settings.CurrencySymbol,
            settings.DefaultBidIncrement,
            lastResult,
            completedSetIds,
            unsoldRoundRemaining,
            settings.MinimumAcquisitionPrice,
            settings.SellAllPlayers,
            currentAttempt
        );
    }

    private async Task<List<TeamAuctionStandingDto>> CalculateTeamStandingsAsync(Guid tournamentId, TournamentSettings settings)
    {
        var teams = await _db.Teams
            .Where(t => t.TournamentId == tournamentId)
            .OrderBy(t => t.Name)
            .ToListAsync();

        var soldLots = await _db.AuctionLots
            .Where(l => l.TournamentId == tournamentId && l.Status == AuctionLotStatus.SOLD && l.WinningTeamId != null)
            .ToListAsync();

        var standings = new List<TeamAuctionStandingDto>();

        foreach (var team in teams)
        {
            var teamSoldLots = soldLots.Where(l => l.WinningTeamId == team.Id).ToList();
            var currentSquadSize = teamSoldLots.Count;
            var totalSpent = teamSoldLots.Sum(l => l.FinalPrice ?? 0);
            var remainingPurse = team.InitialPurse - totalSpent;

            var remainingSlotsToMinSquad = Math.Max(0, settings.MinimumSquadSize - (currentSquadSize + 1));
            var maxSlotsAvailable = Math.Max(0, settings.MaximumSquadSize - currentSquadSize);
            var requiredReserveForMinSquad = remainingSlotsToMinSquad * settings.MinimumAcquisitionPrice;
            var maximumAllowedBid = Math.Max(0, remainingPurse - requiredReserveForMinSquad);

            var canBid = currentSquadSize < settings.MaximumSquadSize && maximumAllowedBid >= settings.MinimumAcquisitionPrice;

            standings.Add(new TeamAuctionStandingDto(
                team.Id,
                team.Name,
                team.ShortName,
                team.PrimaryColor,
                team.SecondaryColor,
                team.LogoUrl,
                team.InitialPurse,
                totalSpent,
                remainingPurse,
                currentSquadSize,
                settings.MinimumSquadSize,
                settings.MaximumSquadSize,
                remainingSlotsToMinSquad,
                maxSlotsAvailable,
                requiredReserveForMinSquad,
                maximumAllowedBid,
                canBid
            ));
        }

        return standings;
    }

    #endregion
}
