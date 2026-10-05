using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Teams;

public class TeamService : ITeamService
{
    private readonly TournamentAuctionDbContext _db;

    public TeamService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<List<TeamDto>> GetTeamsAsync(Guid tournamentId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null)
        {
            throw new UnauthorizedAccessException("You are not a member of this tournament.");
        }

        var teams = await _db.Teams
            .AsNoTracking()
            .Where(t => t.TournamentId == tournamentId)
            .OrderBy(t => t.Name)
            .Select(t => ToDto(t))
            .ToListAsync();

        return teams;
    }

    public async Task<TeamDto?> GetTeamByIdAsync(Guid tournamentId, Guid teamId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null)
        {
            throw new UnauthorizedAccessException("You are not a member of this tournament.");
        }

        var team = await _db.Teams
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.TournamentId == tournamentId && t.Id == teamId);

        return team == null ? null : ToDto(team);
    }

    public async Task<TeamDto> CreateTeamAsync(Guid tournamentId, CreateTeamRequest request, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can create teams.");
        }

        var tournament = await _db.Tournaments
            .Include(t => t.Settings)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
        {
            throw new KeyNotFoundException("Tournament not found.");
        }

        if (tournament.Status != TournamentStatus.DRAFT)
        {
            throw new InvalidOperationException("Teams can only be added when the tournament is in DRAFT status.");
        }

        var trimmedName = request.Name.Trim();
        var trimmedShortName = request.ShortName.Trim().ToUpperInvariant();

        var nameExists = await _db.Teams.AnyAsync(t => t.TournamentId == tournamentId && t.Name.ToLower() == trimmedName.ToLower());
        if (nameExists)
        {
            throw new InvalidOperationException($"A team with name '{trimmedName}' already exists in this tournament.");
        }

        var shortNameExists = await _db.Teams.AnyAsync(t => t.TournamentId == tournamentId && t.ShortName.ToUpper() == trimmedShortName);
        if (shortNameExists)
        {
            throw new InvalidOperationException($"A team with short code '{trimmedShortName}' already exists in this tournament.");
        }

        var settings = tournament.Settings ?? await _db.TournamentSettings.FirstOrDefaultAsync(s => s.TournamentId == tournamentId);
        var defaultPurse = settings?.DefaultStartingPurse ?? 100000;
        var minReserve = (settings?.MinimumSquadSize ?? 12) * (settings?.MinimumAcquisitionPrice ?? 500);

        var finalPurse = request.InitialPurse.HasValue && request.InitialPurse.Value > 0
            ? request.InitialPurse.Value
            : defaultPurse;

        if (finalPurse < minReserve)
        {
            throw new ArgumentException($"Initial purse ({finalPurse}) is below the required reserve for minimum squad ({minReserve}).");
        }

        var team = new Team
        {
            TournamentId = tournamentId,
            Name = trimmedName,
            ShortName = trimmedShortName,
            LogoUrl = request.LogoUrl?.Trim(),
            PrimaryColor = !string.IsNullOrWhiteSpace(request.PrimaryColor) ? request.PrimaryColor.Trim() : "#10B981",
            SecondaryColor = !string.IsNullOrWhiteSpace(request.SecondaryColor) ? request.SecondaryColor.Trim() : "#047857",
            OwnerName = request.OwnerName?.Trim(),
            InitialPurse = finalPurse,
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.Teams.Add(team);
        await _db.SaveChangesAsync();

        return ToDto(team);
    }

    public async Task<TeamDto> UpdateTeamAsync(Guid tournamentId, Guid teamId, UpdateTeamRequest request, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can update teams.");
        }

        var team = await _db.Teams.FirstOrDefaultAsync(t => t.TournamentId == tournamentId && t.Id == teamId);
        if (team == null)
        {
            throw new KeyNotFoundException("Team not found.");
        }

        var trimmedName = request.Name.Trim();
        var trimmedShortName = request.ShortName.Trim().ToUpperInvariant();

        var nameExists = await _db.Teams.AnyAsync(t => t.TournamentId == tournamentId && t.Id != teamId && t.Name.ToLower() == trimmedName.ToLower());
        if (nameExists)
        {
            throw new InvalidOperationException($"Another team in this tournament already has the name '{trimmedName}'.");
        }

        var shortNameExists = await _db.Teams.AnyAsync(t => t.TournamentId == tournamentId && t.Id != teamId && t.ShortName.ToUpper() == trimmedShortName);
        if (shortNameExists)
        {
            throw new InvalidOperationException($"Another team in this tournament already has the short code '{trimmedShortName}'.");
        }

        var settings = await _db.TournamentSettings.FirstOrDefaultAsync(s => s.TournamentId == tournamentId);
        var minReserve = (settings?.MinimumSquadSize ?? 12) * (settings?.MinimumAcquisitionPrice ?? 500);

        if (request.InitialPurse.HasValue && request.InitialPurse.Value > 0)
        {
            if (request.InitialPurse.Value < minReserve)
            {
                throw new ArgumentException($"Initial purse ({request.InitialPurse.Value}) is below the minimum required squad reserve ({minReserve}).");
            }
            team.InitialPurse = request.InitialPurse.Value;
        }

        team.Name = trimmedName;
        team.ShortName = trimmedShortName;
        team.LogoUrl = request.LogoUrl?.Trim();
        if (!string.IsNullOrWhiteSpace(request.PrimaryColor))
            team.PrimaryColor = request.PrimaryColor.Trim();
        if (!string.IsNullOrWhiteSpace(request.SecondaryColor))
            team.SecondaryColor = request.SecondaryColor.Trim();
        team.OwnerName = request.OwnerName?.Trim();
        team.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return ToDto(team);
    }

    public async Task DeleteTeamAsync(Guid tournamentId, Guid teamId, Guid userId)
    {
        var member = await _db.TournamentMembers
            .FirstOrDefaultAsync(m => m.TournamentId == tournamentId && m.UserId == userId);

        if (member == null || member.Role != TournamentRole.OWNER)
        {
            throw new UnauthorizedAccessException("Only the tournament OWNER can delete teams.");
        }

        var tournament = await _db.Tournaments.FindAsync(tournamentId);
        if (tournament == null || tournament.Status != TournamentStatus.DRAFT)
        {
            throw new InvalidOperationException("Teams can only be removed while the tournament is in DRAFT status.");
        }

        var team = await _db.Teams.FirstOrDefaultAsync(t => t.TournamentId == tournamentId && t.Id == teamId);
        if (team == null) return;

        _db.Teams.Remove(team);
        await _db.SaveChangesAsync();
    }

    private static TeamDto ToDto(Team t) =>
        new(
            t.Id,
            t.TournamentId,
            t.Name,
            t.ShortName,
            t.LogoUrl,
            t.PrimaryColor,
            t.SecondaryColor,
            t.OwnerName,
            t.InitialPurse,
            t.CreatedAtUtc,
            t.UpdatedAtUtc
        );
}
