using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.PlayerSets;

public class PlayerSetService : IPlayerSetService
{
    private readonly TournamentAuctionDbContext _db;

    public PlayerSetService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<List<PlayerSetDto>> GetSetsAsync(Guid tournamentId, Guid userId)
    {
        await AssertCanViewTournamentAsync(tournamentId, userId);

        var sets = await _db.PlayerSets
            .Where(s => s.TournamentId == tournamentId)
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.CreatedAtUtc)
            .Select(s => new PlayerSetDto(
                s.Id,
                s.TournamentId,
                s.Name,
                s.Description,
                s.SortOrder,
                s.Players.Count,
                s.CreatedAtUtc
            ))
            .ToListAsync();

        return sets;
    }

    public async Task<PlayerSetDto> GetSetByIdAsync(Guid tournamentId, Guid setId, Guid userId)
    {
        await AssertCanViewTournamentAsync(tournamentId, userId);

        var s = await _db.PlayerSets
            .Include(x => x.Players)
            .FirstOrDefaultAsync(x => x.TournamentId == tournamentId && x.Id == setId);

        if (s == null)
            throw new KeyNotFoundException("Player set not found");

        return new PlayerSetDto(
            s.Id,
            s.TournamentId,
            s.Name,
            s.Description,
            s.SortOrder,
            s.Players.Count,
            s.CreatedAtUtc
        );
    }

    public async Task<PlayerSetDto> CreateSetAsync(Guid tournamentId, CreatePlayerSetRequest request, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Sets can only be added when tournament is in DRAFT status");

        var cleanName = request.Name.Trim();
        var exists = await _db.PlayerSets.AnyAsync(s => 
            s.TournamentId == tournamentId && 
            s.Name.ToLower() == cleanName.ToLower());
        if (exists)
            throw new InvalidOperationException($"A player set named '{cleanName}' already exists in this tournament");

        int nextSort = request.SortOrder ?? 1;
        if (!request.SortOrder.HasValue)
        {
            var maxSort = await _db.PlayerSets
                .Where(s => s.TournamentId == tournamentId)
                .Select(s => (int?)s.SortOrder)
                .MaxAsync();
            nextSort = (maxSort ?? 0) + 1;
        }

        var playerSet = new PlayerSet
        {
            Id = Guid.NewGuid(),
            TournamentId = tournamentId,
            Name = cleanName,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            SortOrder = nextSort,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.PlayerSets.Add(playerSet);
        await _db.SaveChangesAsync();

        return new PlayerSetDto(
            playerSet.Id,
            playerSet.TournamentId,
            playerSet.Name,
            playerSet.Description,
            playerSet.SortOrder,
            0,
            playerSet.CreatedAtUtc
        );
    }

    public async Task<PlayerSetDto> UpdateSetAsync(Guid tournamentId, Guid setId, UpdatePlayerSetRequest request, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Sets can only be updated when tournament is in DRAFT status");

        var set = await _db.PlayerSets
            .Include(s => s.Players)
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId && s.Id == setId);
        if (set == null)
            throw new KeyNotFoundException("Player set not found");

        var cleanName = request.Name.Trim();
        var duplicate = await _db.PlayerSets.AnyAsync(s => 
            s.TournamentId == tournamentId && 
            s.Id != setId && 
            s.Name.ToLower() == cleanName.ToLower());
        if (duplicate)
            throw new InvalidOperationException($"Another player set named '{cleanName}' already exists");

        set.Name = cleanName;
        set.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        set.SortOrder = request.SortOrder;

        await _db.SaveChangesAsync();

        return new PlayerSetDto(
            set.Id,
            set.TournamentId,
            set.Name,
            set.Description,
            set.SortOrder,
            set.Players.Count,
            set.CreatedAtUtc
        );
    }

    public async Task DeleteSetAsync(Guid tournamentId, Guid setId, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Sets can only be removed when tournament is in DRAFT status");

        var set = await _db.PlayerSets
            .Include(s => s.Players)
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId && s.Id == setId);
        if (set == null)
            throw new KeyNotFoundException("Player set not found");

        if (set.Players.Count > 0)
            throw new InvalidOperationException($"Cannot delete set '{set.Name}' because it currently contains {set.Players.Count} players. Reassign or delete the players first.");

        _db.PlayerSets.Remove(set);
        await _db.SaveChangesAsync();
    }

    public async Task ReorderSetsAsync(Guid tournamentId, ReorderPlayerSetsRequest request, Guid userId)
    {
        var tournament = await AssertCanManageTournamentAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Sets can only be reordered when tournament is in DRAFT status");

        var existingSets = await _db.PlayerSets
            .Where(s => s.TournamentId == tournamentId)
            .ToListAsync();

        for (int i = 0; i < request.OrderedSetIds.Count; i++)
        {
            var id = request.OrderedSetIds[i];
            var set = existingSets.FirstOrDefault(s => s.Id == id);
            if (set != null)
            {
                set.SortOrder = i + 1;
            }
        }

        await _db.SaveChangesAsync();
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
            throw new UnauthorizedAccessException("Only tournament owners or auctioneers can manage player sets");

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
