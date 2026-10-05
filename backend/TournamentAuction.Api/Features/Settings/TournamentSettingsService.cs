using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Settings;

public class TournamentSettingsService : ITournamentSettingsService
{
    private readonly TournamentAuctionDbContext _db;

    public TournamentSettingsService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<TournamentSettingsDto> GetSettingsAsync(Guid tournamentId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null)
        {
            throw new UnauthorizedAccessException("You are not a member of this tournament.");
        }

        var settings = await _db.TournamentSettings
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId);

        if (settings == null)
        {
            // Fallback: create default if missing
            settings = new TournamentSettings
            {
                TournamentId = tournamentId,
                CreatedAtUtc = DateTime.UtcNow
            };
            _db.TournamentSettings.Add(settings);
            await _db.SaveChangesAsync();
        }

        return ToDto(settings);
    }

    public async Task<TournamentSettingsDto> UpdateSettingsAsync(Guid tournamentId, UpdateTournamentSettingsRequest request, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can modify tournament settings.");
        }

        var tournament = await _db.Tournaments.FindAsync(tournamentId);
        if (tournament == null)
        {
            throw new KeyNotFoundException("Tournament not found.");
        }

        if (tournament.Status != TournamentStatus.DRAFT)
        {
            throw new InvalidOperationException("Tournament settings can only be modified while in DRAFT status.");
        }

        // Domain validation
        if (request.MaximumSquadSize < request.MinimumSquadSize)
        {
            throw new ArgumentException("Maximum squad size cannot be less than minimum squad size.");
        }

        var requiredStartingReserve = request.MinimumSquadSize * request.MinimumAcquisitionPrice;
        if (request.DefaultStartingPurse < requiredStartingReserve)
        {
            throw new ArgumentException($"Default starting purse ({request.DefaultStartingPurse}) cannot be less than the minimum required squad reserve ({requiredStartingReserve}).");
        }

        var settings = await _db.TournamentSettings
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId);

        if (settings == null)
        {
            settings = new TournamentSettings { TournamentId = tournamentId };
            _db.TournamentSettings.Add(settings);
        }

        settings.CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
        settings.CurrencySymbol = request.CurrencySymbol.Trim();
        settings.DefaultStartingPurse = request.DefaultStartingPurse;
        settings.MinimumSquadSize = request.MinimumSquadSize;
        settings.MaximumSquadSize = request.MaximumSquadSize;
        settings.MinimumAcquisitionPrice = request.MinimumAcquisitionPrice;
        settings.DefaultBidIncrement = request.DefaultBidIncrement;
        settings.PublicLiveViewEnabled = request.PublicLiveViewEnabled;
        settings.SellAllPlayers = request.SellAllPlayers;
        settings.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return ToDto(settings);
    }

    private static TournamentSettingsDto ToDto(TournamentSettings s) =>
        new(
            s.Id,
            s.TournamentId,
            s.CurrencyCode,
            s.CurrencySymbol,
            s.DefaultStartingPurse,
            s.MinimumSquadSize,
            s.MaximumSquadSize,
            s.MinimumAcquisitionPrice,
            s.DefaultBidIncrement,
            s.PublicLiveViewEnabled,
            s.CreatedAtUtc,
            s.UpdatedAtUtc,
            s.SellAllPlayers
        );
}
