using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Tournaments;

public class TournamentService : ITournamentService
{
    private readonly TournamentAuctionDbContext _db;

    public TournamentService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<List<TournamentSummaryDto>> GetTournamentsForUserAsync(Guid userId)
    {
        var tournaments = await _db.TournamentMembers
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .Include(m => m.Tournament)
            .OrderByDescending(m => m.Tournament.CreatedAtUtc)
            .Select(m => new TournamentSummaryDto(
                m.Tournament.Id,
                m.Tournament.Name,
                m.Tournament.Slug,
                m.Tournament.Season,
                m.Tournament.Status,
                m.Role.ToString(),
                m.Tournament.CreatedAtUtc
            ))
            .ToListAsync();

        return tournaments;
    }

    public async Task<TournamentResponse?> GetTournamentByIdAsync(Guid tournamentId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .AsNoTracking()
            .Include(m => m.Tournament)
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null) return null;

        var t = member.Tournament;
        return new TournamentResponse(
            t.Id,
            t.Name,
            t.Slug,
            t.Season,
            t.Description,
            t.LogoUrl,
            t.TournamentDate,
            t.Location,
            t.TimeZone,
            t.Status,
            t.OwnerUserId,
            member.Role.ToString(),
            t.CreatedAtUtc,
            t.UpdatedAtUtc
        );
    }

    public async Task<TournamentResponse> CreateTournamentAsync(CreateTournamentRequest request, Guid userId)
    {
        var user = await _db.Users.FindAsync(userId);
        if (user == null)
        {
            throw new KeyNotFoundException("User not found.");
        }

        var baseSlug = !string.IsNullOrWhiteSpace(request.Slug) 
            ? GenerateSlug(request.Slug) 
            : GenerateSlug(request.Name);

        var finalSlug = baseSlug;
        var suffix = 1;
        while (await _db.Tournaments.AnyAsync(t => t.Slug == finalSlug))
        {
            finalSlug = $"{baseSlug}-{suffix++}";
        }

        var tournament = new Tournament
        {
            Name = request.Name.Trim(),
            Slug = finalSlug,
            Season = request.Season.Trim(),
            Description = request.Description?.Trim(),
            LogoUrl = request.LogoUrl?.Trim(),
            TournamentDate = request.TournamentDate,
            Location = request.Location?.Trim(),
            TimeZone = !string.IsNullOrWhiteSpace(request.TimeZone) ? request.TimeZone.Trim() : "Asia/Kolkata",
            Status = TournamentStatus.DRAFT,
            OwnerUserId = userId,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.Tournaments.Add(tournament);

        var ownerMember = new TournamentMember
        {
            TournamentId = tournament.Id,
            UserId = userId,
            Role = TournamentRole.OWNER,
            CreatedAtUtc = DateTime.UtcNow
        };
        _db.TournamentMembers.Add(ownerMember);

        // Default auction settings
        var settings = new TournamentSettings
        {
            TournamentId = tournament.Id,
            CurrencyCode = "INR",
            CurrencySymbol = "₹",
            DefaultStartingPurse = 100000,
            MinimumSquadSize = 12,
            MaximumSquadSize = 16,
            MinimumAcquisitionPrice = 500,
            DefaultBidIncrement = 100,
            PublicLiveViewEnabled = true,
            CreatedAtUtc = DateTime.UtcNow
        };
        _db.TournamentSettings.Add(settings);

        // Standard initial base price tiers
        var defaultTiers = new[]
        {
            new BasePriceTier { TournamentId = tournament.Id, Label = "₹500", Amount = 500, SortOrder = 1 },
            new BasePriceTier { TournamentId = tournament.Id, Label = "₹1,000", Amount = 1000, SortOrder = 2 },
            new BasePriceTier { TournamentId = tournament.Id, Label = "₹1,500", Amount = 1500, SortOrder = 3 },
            new BasePriceTier { TournamentId = tournament.Id, Label = "₹2,000", Amount = 2000, SortOrder = 4 },
            new BasePriceTier { TournamentId = tournament.Id, Label = "₹5,000", Amount = 5000, SortOrder = 5 }
        };
        _db.BasePriceTiers.AddRange(defaultTiers);

        await _db.SaveChangesAsync();

        return new TournamentResponse(
            tournament.Id,
            tournament.Name,
            tournament.Slug,
            tournament.Season,
            tournament.Description,
            tournament.LogoUrl,
            tournament.TournamentDate,
            tournament.Location,
            tournament.TimeZone,
            tournament.Status,
            tournament.OwnerUserId,
            TournamentRole.OWNER.ToString(),
            tournament.CreatedAtUtc,
            tournament.UpdatedAtUtc
        );
    }

    public async Task<TournamentResponse> UpdateTournamentAsync(Guid tournamentId, UpdateTournamentRequest request, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can update tournament details.");
        }

        var tournament = await _db.Tournaments.FindAsync(tournamentId);
        if (tournament == null)
        {
            throw new KeyNotFoundException("Tournament not found.");
        }

        tournament.Name = request.Name.Trim();
        tournament.Season = request.Season.Trim();
        tournament.Description = request.Description?.Trim();
        tournament.LogoUrl = request.LogoUrl?.Trim();
        tournament.TournamentDate = request.TournamentDate;
        tournament.Location = request.Location?.Trim();
        if (!string.IsNullOrWhiteSpace(request.TimeZone))
        {
            tournament.TimeZone = request.TimeZone.Trim();
        }
        tournament.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return new TournamentResponse(
            tournament.Id,
            tournament.Name,
            tournament.Slug,
            tournament.Season,
            tournament.Description,
            tournament.LogoUrl,
            tournament.TournamentDate,
            tournament.Location,
            tournament.TimeZone,
            tournament.Status,
            tournament.OwnerUserId,
            member.Role.ToString(),
            tournament.CreatedAtUtc,
            tournament.UpdatedAtUtc
        );
    }

    public async Task DeleteTournamentAsync(Guid tournamentId, Guid userId)
    {
        await using var transaction = _db.Database.IsRelational()
            ? await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable) : null;
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can delete a tournament.");
        }

        var tournament = await _db.Tournaments.FindAsync(tournamentId);
        if (tournament == null) return;

        var sessions = await _db.AuctionSessions.Where(s => s.TournamentId == tournamentId).ToListAsync();
        if (tournament.Status == TournamentStatus.LIVE ||
            sessions.Any(s => s.Status == AuctionSessionStatus.LIVE || s.Status == AuctionSessionStatus.PAUSED))
        {
            throw new InvalidOperationException("A live or paused auction cannot be deleted. Complete the auction first.");
        }

        // Break the session/current-lot cycle before removing auction history.
        foreach (var session in sessions)
        {
            session.CurrentLotId = null;
            session.CurrentLot = null;
        }
        await _db.SaveChangesAsync();

        // Load every dependent so EF orders restricted foreign keys correctly,
        // and the entire operation remains atomic on PostgreSQL.
        _db.AuctionEvents.RemoveRange(await _db.AuctionEvents.Where(e => e.TournamentId == tournamentId).ToListAsync());
        _db.AuctionLots.RemoveRange(await _db.AuctionLots.Where(l => l.TournamentId == tournamentId).ToListAsync());
        _db.PlayerRegistrations.RemoveRange(await _db.PlayerRegistrations.Where(r => r.TournamentId == tournamentId).ToListAsync());
        _db.RegistrationForms.RemoveRange(await _db.RegistrationForms.Where(f => f.TournamentId == tournamentId).ToListAsync());
        _db.Players.RemoveRange(await _db.Players.Where(p => p.TournamentId == tournamentId).ToListAsync());
        _db.PlayerSets.RemoveRange(await _db.PlayerSets.Where(s => s.TournamentId == tournamentId).ToListAsync());
        _db.Teams.RemoveRange(await _db.Teams.Where(t => t.TournamentId == tournamentId).ToListAsync());
        _db.BasePriceTiers.RemoveRange(await _db.BasePriceTiers.Where(t => t.TournamentId == tournamentId).ToListAsync());
        _db.TournamentSettings.RemoveRange(await _db.TournamentSettings.Where(s => s.TournamentId == tournamentId).ToListAsync());
        _db.TournamentMembers.RemoveRange(await _db.TournamentMembers.Where(m => m.TournamentId == tournamentId).ToListAsync());
        _db.AuctionSessions.RemoveRange(sessions);
        _db.Tournaments.Remove(tournament);
        await _db.SaveChangesAsync();
        if (transaction != null) await transaction.CommitAsync();
    }

    private static string GenerateSlug(string phrase)
    {
        var str = phrase.ToLowerInvariant();
        // remove invalid chars
        str = Regex.Replace(str, @"[^a-z0-9\s-]", "");
        // convert multiple spaces into one space
        str = Regex.Replace(str, @"\s+", " ").Trim();
        // cut and trim
        str = str.Substring(0, str.Length <= 45 ? str.Length : 45).Trim();
        str = Regex.Replace(str, @"\s", "-"); // hyphens
        return string.IsNullOrEmpty(str) ? "tournament" : str;
    }
}
