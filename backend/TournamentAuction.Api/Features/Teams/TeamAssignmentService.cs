using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Teams;

public class TeamAssignmentService(TournamentAuctionDbContext db)
{
    private async Task AssertMember(Guid tournamentId, Guid userId, bool owner)
    {
        if (!await db.TournamentMembers.AnyAsync(m => m.TournamentId == tournamentId && m.UserId == userId && (!owner || m.Role == TournamentRole.OWNER)))
            throw new UnauthorizedAccessException(owner ? "Only the tournament OWNER can assign captains and icon players." : "You are not a member of this tournament.");
    }
    public async Task<TeamAssignmentsDto> GetAsync(Guid tournamentId, Guid teamId, Guid userId)
    {
        await AssertMember(tournamentId,userId,false);
        if (!await db.Teams.AnyAsync(t => t.Id == teamId && t.TournamentId == tournamentId)) throw new KeyNotFoundException("Team not found.");
        var players = await db.Players.AsNoTracking().Where(p => p.TournamentId == tournamentId && (p.Status == "AVAILABLE" || p.AssignedTeamId == teamId)).OrderBy(p => p.Name).ToListAsync();
        var maximumSquadSize = await db.TournamentSettings.Where(s => s.TournamentId == tournamentId).Select(s => (int?)s.MaximumSquadSize).SingleOrDefaultAsync() ?? 16;
        return new(players.Where(p => p.AssignedTeamId == teamId).OrderBy(p => p.AssignedRole).ThenBy(p => p.Name).Select(TeamAssignedPlayerDto.From).ToList(),
            players.Select(p => new TeamAssignmentCandidateDto(p.Id,p.Name,p.PhotoUrl,p.Position)).ToList(), maximumSquadSize);
    }
    public async Task<TeamAssignmentsDto> UpdateAsync(Guid tournamentId, Guid teamId, Guid userId, TeamAssignmentsRequest request)
    {
        await AssertMember(tournamentId,userId,true);
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        if (tx != null) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Tournaments\" WHERE \"Id\" = {tournamentId} FOR UPDATE");
        var tournament = await db.Tournaments.AsNoTracking().SingleOrDefaultAsync(t => t.Id == tournamentId) ?? throw new KeyNotFoundException("Tournament not found.");
        if (tournament.Status != TournamentStatus.DRAFT) throw new InvalidOperationException("Captains and icon players can only be assigned while the tournament is in DRAFT.");
        if (!await db.Teams.AnyAsync(t => t.Id == teamId && t.TournamentId == tournamentId)) throw new KeyNotFoundException("Team not found.");
        if (request.IconPlayerIds != null && request.IconPlayerId != null)
            throw new ArgumentException("Send iconPlayerIds without the legacy iconPlayerId field.");
        var iconIds = request.IconPlayerIds?.ToList() ?? (request.IconPlayerId is Guid iconId ? new List<Guid> { iconId } : new List<Guid>());
        if (iconIds.Count != iconIds.Distinct().Count()) throw new ArgumentException("An icon player can only be selected once.");
        if (request.CaptainPlayerId is Guid captainId && iconIds.Contains(captainId)) throw new ArgumentException("Captain and icon players must be different players.");
        var ids = iconIds.ToList();
        if (request.CaptainPlayerId is Guid selectedCaptainId) ids.Add(selectedCaptainId);
        var settings = await db.TournamentSettings.SingleOrDefaultAsync(s => s.TournamentId == tournamentId);
        if (ids.Count > (settings?.MaximumSquadSize ?? 16)) throw new InvalidOperationException("Assigned players cannot exceed the maximum squad size.");
        var candidates = await db.Players.Where(p => ids.Contains(p.Id) && p.TournamentId == tournamentId).ToListAsync();
        if (candidates.Count != ids.Count || candidates.Any(p => p.Status != "AVAILABLE" && !(p.Status == "ASSIGNED" && p.AssignedTeamId == teamId)))
            throw new InvalidOperationException("Select available registered players from this tournament. Players assigned to another team cannot be selected.");
        var current = await db.Players.Where(p => p.TournamentId == tournamentId && p.AssignedTeamId == teamId).ToListAsync();
        if (request.IconPlayerIds == null && current.Count(p => p.AssignedRole == "ICON") > 1)
            throw new InvalidOperationException("Refresh the application to manage this team's multiple icon players.");
        var touched = current.Select(p => p.Id).Concat(ids).Distinct().ToList();
        if (await db.AuctionLots.AnyAsync(l => touched.Contains(l.PlayerId))) throw new InvalidOperationException("Players who have entered an auction cannot be assigned or released.");
        // Release the current roles first so a captain/icon swap cannot violate captain uniqueness.
        // Both saves commit together under the tournament lock.
        foreach (var player in current) {player.AssignedTeamId=null;player.AssignedRole=null;player.Status="AVAILABLE";player.UpdatedAtUtc=DateTime.UtcNow;}
        await db.SaveChangesAsync();
        foreach (var player in candidates) {player.AssignedTeamId=teamId;player.AssignedRole=player.Id == request.CaptainPlayerId ? "CAPTAIN":"ICON";player.Status="ASSIGNED";player.UpdatedAtUtc=DateTime.UtcNow;}
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return await GetAsync(tournamentId,teamId,userId);
    }
}
