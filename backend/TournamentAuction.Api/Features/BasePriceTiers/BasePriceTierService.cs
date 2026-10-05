using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.BasePriceTiers;

public class BasePriceTierService : IBasePriceTierService
{
    private readonly TournamentAuctionDbContext _db;

    public BasePriceTierService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<List<BasePriceTierDto>> GetTiersAsync(Guid tournamentId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null)
        {
            throw new UnauthorizedAccessException("You are not a member of this tournament.");
        }

        var tiers = await _db.BasePriceTiers
            .AsNoTracking()
            .Where(t => t.TournamentId == tournamentId)
            .OrderBy(t => t.Amount)
            .Select(t => new BasePriceTierDto(t.Id, t.TournamentId, t.Label, t.Amount, t.SortOrder))
            .ToListAsync();

        return tiers;
    }

    public async Task<BasePriceTierDto> CreateTierAsync(Guid tournamentId, CreateBasePriceTierRequest request, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can configure base price tiers.");
        }

        var tournament = await _db.Tournaments.FindAsync(tournamentId);
        if (tournament == null)
        {
            throw new KeyNotFoundException("Tournament not found.");
        }

        if (tournament.Status != TournamentStatus.DRAFT)
        {
            throw new InvalidOperationException("Base price tiers can only be modified in DRAFT status.");
        }

        var exists = await _db.BasePriceTiers.AnyAsync(t => t.TournamentId == tournamentId && t.Amount == request.Amount);
        if (exists)
        {
            throw new InvalidOperationException($"A base price tier with amount {request.Amount} already exists.");
        }

        var tier = new BasePriceTier
        {
            TournamentId = tournamentId,
            Label = request.Label.Trim(),
            Amount = request.Amount,
            SortOrder = request.SortOrder,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.BasePriceTiers.Add(tier);
        await _db.SaveChangesAsync();

        return new BasePriceTierDto(tier.Id, tier.TournamentId, tier.Label, tier.Amount, tier.SortOrder);
    }

    public async Task DeleteTierAsync(Guid tournamentId, Guid tierId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can delete base price tiers.");
        }

        var tier = await _db.BasePriceTiers.FirstOrDefaultAsync(t => t.TournamentId == tournamentId && t.Id == tierId);
        if (tier == null) return;

        _db.BasePriceTiers.Remove(tier);
        await _db.SaveChangesAsync();
    }
}
