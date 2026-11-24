using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Api.Features.FanChoice;

public class FanChoiceService(TournamentAuctionDbContext db, IHubContext<AuctionHub> hub, ILogger<FanChoiceService> logger)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static string? VoterHash(Guid tournamentId, string? token)
    {
        if (string.IsNullOrEmpty(token)) return null;
        if (token.Length != 64 || token.Any(c => !char.IsAsciiHexDigit(c)))
            throw new ArgumentException("Invalid browser voting identity. Reload the voting page.");
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes($"FanChoice:v1:{tournamentId:N}:{token.ToLowerInvariant()}")));
    }

    private async Task<Tournament> PublicTournament(string slug)
    {
        var tournament = await db.Tournaments.AsNoTracking().Include(t => t.Settings).SingleOrDefaultAsync(t => t.Slug == slug);
        if (tournament?.Status != TournamentStatus.COMPLETED || tournament.Settings?.PublicLiveViewEnabled != true)
            throw new KeyNotFoundException("Fan Choice is unavailable for this tournament.");
        return tournament;
    }

    private async Task<Tournament> OwnedTournament(Guid id, Guid userId)
    {
        var tournament = await db.Tournaments.AsNoTracking().Include(t => t.Settings).SingleOrDefaultAsync(t => t.Id == id)
            ?? throw new KeyNotFoundException("Tournament not found.");
        if (tournament.OwnerUserId != userId && !await db.TournamentMembers.AnyAsync(m => m.TournamentId == id && m.UserId == userId && m.Role == TournamentRole.OWNER))
            throw new UnauthorizedAccessException("Only the tournament owner can manage Fan Choice.");
        return tournament;
    }

    private async Task Notify(Guid tournamentId)
    {
        // Only an invalidation is broadcast. Results remain protected by each browser's saved vote.
        try { await hub.Clients.Group(AuctionHub.FanChoiceGroup(tournamentId)).SendAsync("FanChoiceChanged", new { tournamentId }); }
        catch (Exception ex) { logger.LogWarning(ex, "Fan Choice committed but its notification could not be sent for {TournamentId}", tournamentId); }
    }

    public async Task<FanChoicePageDto> GetPublicAsync(string slug, string? browserToken)
    {
        var tournament = await PublicTournament(slug);
        var hash = VoterHash(tournament.Id, browserToken);
        var polls = await db.FanChoicePolls.AsNoTracking().Where(p => p.TournamentId == tournament.Id && p.Enabled).ToListAsync();
        if (polls.Count == 0) throw new KeyNotFoundException("Fan Choice has not been enabled. Ask the organiser for the voting link.");
        var pollIds = polls.Select(p => p.Id).ToList();
        var options = await db.FanChoiceOptions.AsNoTracking().Where(o => pollIds.Contains(o.PollId)).OrderBy(o => o.Name).ThenBy(o => o.Id).ToListAsync();
        var ownVotes = hash == null ? new List<FanChoiceVote>() : await db.FanChoiceVotes.AsNoTracking().Where(v => pollIds.Contains(v.PollId) && v.VoterHash == hash).ToListAsync();
        var votedPolls = ownVotes.Select(v => v.PollId).ToList();
        var counts = await db.FanChoiceVotes.AsNoTracking().Where(v => votedPolls.Contains(v.PollId))
            .GroupBy(v => new { v.PollId, v.OptionId }).Select(g => new { g.Key.PollId, g.Key.OptionId, Count = g.Count() }).ToListAsync();
        var countsByOption = counts.ToDictionary(c => c.OptionId, c => c.Count);
        var totalsByPoll = counts.GroupBy(c => c.PollId).ToDictionary(g => g.Key, g => g.Sum(c => c.Count));
        var result = new List<FanChoicePollDto>();
        foreach (var definition in FanChoiceCategories.All)
        {
            var poll = polls.SingleOrDefault(p => p.Category == definition.Key);
            if (poll == null) continue;
            var ownVote = ownVotes.SingleOrDefault(v => v.PollId == poll.Id);
            var total = totalsByPoll.GetValueOrDefault(poll.Id);
            var choices = options.Where(o => o.PollId == poll.Id).Select(o =>
            {
                var count = countsByOption.GetValueOrDefault(o.Id);
                return new FanChoiceOptionDto(o.Id, o.Name, o.PhotoUrl, o.Subtitle, o.Price,
                    o.RosterJson == null ? null : JsonSerializer.Deserialize<List<FanSquadMemberDto>>(o.RosterJson, Json),
                    ownVote == null ? null : count, ownVote == null ? null : total == 0 ? 0 : Math.Round(100m * count / total, 1));
            }).ToList();
            result.Add(new(poll.Id, poll.Category, definition.Title, definition.Description, poll.IsOpen,
                ownVote?.OptionId, ownVote == null ? null : total, choices));
        }
        return new(tournament.Id, tournament.Name, tournament.Slug, tournament.LogoUrl, tournament.Settings!.CurrencyCode, result);
    }

    public async Task<FanChoiceAdminDto> GetAdminAsync(Guid id, Guid userId)
    {
        var tournament = await OwnedTournament(id, userId);
        var polls = await db.FanChoicePolls.AsNoTracking().Where(p => p.TournamentId == id).ToListAsync();
        var ids = polls.Select(p => p.Id).ToList();
        var optionCounts = await db.FanChoiceOptions.Where(o => ids.Contains(o.PollId)).GroupBy(o => o.PollId).Select(g => new { Id = g.Key, Count = g.Count() }).ToListAsync();
        var voteCounts = await db.FanChoiceVotes.Where(v => ids.Contains(v.PollId)).GroupBy(v => v.PollId).Select(g => new { Id = g.Key, Count = g.Count() }).ToListAsync();
        var candidates = tournament.Status == TournamentStatus.COMPLETED ? await Candidates(id) : null;
        return new(tournament.Status == TournamentStatus.COMPLETED, tournament.Settings?.PublicLiveViewEnabled == true,
            FanChoiceCategories.All.Select(d =>
            {
                var poll = polls.SingleOrDefault(p => p.Category == d.Key);
                var options = optionCounts.SingleOrDefault(c => c.Id == poll?.Id)?.Count ?? 0;
                return new FanChoiceAdminPollDto(d.Key, d.Title, poll?.Enabled ?? false, poll?.IsOpen ?? false,
                    options > 0 ? options : candidates?[d.Key].Count ?? 0, voteCounts.SingleOrDefault(c => c.Id == poll?.Id)?.Count ?? 0);
            }).ToList());
    }

    public async Task<FanChoiceAdminDto> ConfigureAsync(Guid id, Guid userId, string category, FanChoiceSettingsRequest request)
    {
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        if (tx != null) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Tournaments\" WHERE \"Id\" = {id} FOR UPDATE");
        var tournament = await OwnedTournament(id, userId);
        if (!FanChoiceCategories.All.Any(d => d.Key == category)) throw new ArgumentException("Unknown Fan Choice category.");
        if (request.IsOpen && (!request.Enabled || tournament.Status != TournamentStatus.COMPLETED || tournament.Settings?.PublicLiveViewEnabled != true))
            throw new InvalidOperationException("Complete the auction, enable Public Live View and enable this category before opening voting.");
        var poll = await db.FanChoicePolls.SingleOrDefaultAsync(p => p.TournamentId == id && p.Category == category);
        var newPoll = poll == null;
        poll ??= new() { TournamentId = id, Category = category };
        if (request.IsOpen && !await db.FanChoiceOptions.AnyAsync(o => o.PollId == poll.Id))
        {
            var candidates = (await Candidates(id))[category];
            if (candidates.Count == 0) throw new InvalidOperationException("There are no eligible choices for this category.");
            foreach (var option in candidates) { option.PollId = poll.Id; db.FanChoiceOptions.Add(option); }
        }
        poll.Enabled = request.Enabled;
        poll.IsOpen = request.IsOpen;
        if (newPoll) db.FanChoicePolls.Add(poll);
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        await Notify(id);
        return await GetAdminAsync(id, userId);
    }

    public async Task<FanChoicePageDto> VoteAsync(string slug, Guid pollId, string? browserToken, Guid optionId)
    {
        var tournament = await PublicTournament(slug);
        var hash = VoterHash(tournament.Id, browserToken) ?? throw new ArgumentException("A browser voting identity is required.");
        await using var tx = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync() : null;
        if (tx != null) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Tournaments\" WHERE \"Id\" = {tournament.Id} FOR UPDATE");
        // Recheck access under the same lock used by open/close and tournament deletion.
        await PublicTournament(slug);
        var poll = await db.FanChoicePolls.SingleOrDefaultAsync(p => p.Id == pollId && p.TournamentId == tournament.Id && p.Enabled)
            ?? throw new KeyNotFoundException("This voting category is unavailable.");
        var existing = await db.FanChoiceVotes.AsNoTracking().SingleOrDefaultAsync(v => v.PollId == poll.Id && v.VoterHash == hash);
        if (existing != null && existing.OptionId != optionId) throw new InvalidOperationException("Your vote is permanent and cannot be changed.");
        if (existing == null)
        {
            if (!poll.IsOpen) throw new InvalidOperationException("Voting is closed for this category.");
            if (!await db.FanChoiceOptions.AnyAsync(o => o.Id == optionId && o.PollId == poll.Id)) throw new ArgumentException("Choose an eligible option from this category.");
            db.FanChoiceVotes.Add(new() { PollId = poll.Id, OptionId = optionId, VoterHash = hash });
            await db.SaveChangesAsync();
        }
        if (tx != null) await tx.CommitAsync();
        if (existing == null) await Notify(tournament.Id);
        return await GetPublicAsync(slug, browserToken);
    }

    private async Task<Dictionary<string, List<FanChoiceOption>>> Candidates(Guid tournamentId)
    {
        var players = await db.Players.AsNoTracking().Where(p => p.TournamentId == tournamentId).ToListAsync();
        var teams = await db.Teams.AsNoTracking().Where(t => t.TournamentId == tournamentId).ToListAsync();
        var sales = await db.AuctionLots.AsNoTracking().Where(l => l.TournamentId == tournamentId && l.Status == AuctionLotStatus.SOLD).ToListAsync();
        var salesByPlayer = sales.ToDictionary(l => l.PlayerId);
        string? TeamName(Player p) => teams.SingleOrDefault(t => t.Id == (p.AssignedTeamId ?? salesByPlayer.GetValueOrDefault(p.Id)?.WinningTeamId))?.Name;
        FanChoiceOption PlayerOption(Player p) => new() { CandidateId = p.Id, Name = p.Name, PhotoUrl = p.PhotoUrl,
            Subtitle = string.Join(" · ", new[] { TeamName(p), p.AssignedRole == "CAPTAIN" ? "Captain" : p.AssignedRole == "ICON" ? "Icon player" : p.Status == "FINAL_UNSOLD" || p.Status == "UNSOLD" ? "Unsold" : null, p.Position }.Where(s => !string.IsNullOrWhiteSpace(s))),
            Price = salesByPlayer.GetValueOrDefault(p.Id)?.FinalPrice };
        var squads = teams.Select(t => new { Team = t, Players = players.Where(p => p.AssignedTeamId == t.Id || salesByPlayer.GetValueOrDefault(p.Id)?.WinningTeamId == t.Id).ToList() }).Where(s => s.Players.Count > 0);
        return new()
        {
            ["BEST_BUY"] = players.Where(p => p.Status == "SOLD" && p.AssignedTeamId == null && salesByPlayer.ContainsKey(p.Id)).Select(PlayerOption).ToList(),
            ["STRONGEST_SQUAD"] = squads.Select(s => new FanChoiceOption { CandidateId = s.Team.Id, Name = s.Team.Name, PhotoUrl = s.Team.LogoUrl,
                Subtitle = $"{s.Players.Count} squad players · {s.Players.Count(p => p.AssignedRole == "ICON")} icons",
                RosterJson = JsonSerializer.Serialize(s.Players.OrderBy(p => p.AssignedRole == null).ThenBy(p => p.AssignedRole).ThenBy(p => p.Name)
                    .Select(p => new FanSquadMemberDto(p.Name, p.PhotoUrl, p.Position, p.AssignedRole)).ToList(), Json) }).ToList(),
            ["FAVOURITE_PLAYER"] = players.Select(PlayerOption).ToList(),
            ["BEST_CAPTAIN"] = players.Where(p => p.Status == "ASSIGNED" && p.AssignedRole == "CAPTAIN" && TeamName(p) != null).Select(PlayerOption).ToList(),
            ["BEST_ICON"] = players.Where(p => p.Status == "ASSIGNED" && p.AssignedRole == "ICON" && TeamName(p) != null).Select(PlayerOption).ToList()
        };
    }
}
