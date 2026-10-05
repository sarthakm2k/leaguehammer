using System.Text;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Features.Players;

public class PlayerService : IPlayerService
{
    private readonly TournamentAuctionDbContext _db;

    public PlayerService(TournamentAuctionDbContext db)
    {
        _db = db;
    }

    public async Task<PagedPlayersDto> GetPlayersAsync(Guid tournamentId, PlayerFilterRequest filter, Guid userId)
    {
        await AssertCanViewTournamentAsync(tournamentId, userId);

        var query = _db.Players
            .Include(p => p.PlayerSet)
            .Where(p => p.TournamentId == tournamentId);

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLower();
            query = query.Where(p => 
                p.Name.ToLower().Contains(term) ||
                (p.PreviousTeam != null && p.PreviousTeam.ToLower().Contains(term)) ||
                (p.Position != null && p.Position.ToLower().Contains(term)));
        }

        if (filter.PlayerSetId.HasValue)
        {
            query = query.Where(p => p.PlayerSetId == filter.PlayerSetId.Value);
        }

        if (!string.IsNullOrWhiteSpace(filter.Position))
        {
            var pos = filter.Position.Trim().ToLower();
            query = query.Where(p => p.Position != null && p.Position.ToLower() == pos);
        }

        var totalCount = await query.CountAsync();

        var page = Math.Max(1, filter.Page);
        var pageSize = Math.Clamp(filter.PageSize, 1, 200);

        var items = await query
            .OrderBy(p => p.PlayerSet.SortOrder)
            .ThenBy(p => p.Name)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new PlayerDto(
                p.Id,
                p.TournamentId,
                p.PlayerSetId,
                p.PlayerSet.Name,
                p.Name,
                p.PhotoUrl,
                p.Age,
                p.Position,
                p.PreferredFoot,
                p.BasePrice,
                p.JerseyNumber,
                p.PreviousTeam,
                p.ShortBio,
                p.Status,
                p.CreatedAtUtc,
                p.UpdatedAtUtc
            ))
            .ToListAsync();

        var totalPages = (int)Math.Ceiling(totalCount / (double)pageSize);

        return new PagedPlayersDto(items, totalCount, page, pageSize, totalPages);
    }

    public async Task<PlayerDto> GetPlayerByIdAsync(Guid tournamentId, Guid playerId, Guid userId)
    {
        await AssertCanViewTournamentAsync(tournamentId, userId);

        var p = await _db.Players
            .Include(x => x.PlayerSet)
            .FirstOrDefaultAsync(x => x.TournamentId == tournamentId && x.Id == playerId);

        if (p == null)
            throw new KeyNotFoundException("Player not found");

        return new PlayerDto(
            p.Id,
            p.TournamentId,
            p.PlayerSetId,
            p.PlayerSet.Name,
            p.Name,
            p.PhotoUrl,
            p.Age,
            p.Position,
            p.PreferredFoot,
            p.BasePrice,
            p.JerseyNumber,
            p.PreviousTeam,
            p.ShortBio,
            p.Status,
            p.CreatedAtUtc,
            p.UpdatedAtUtc
        );
    }

    public async Task<PlayerDto> CreatePlayerAsync(Guid tournamentId, CreatePlayerRequest request, Guid userId)
    {
        var (tournament, settings) = await AssertCanManageTournamentAndGetSettingsAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Players can only be added when tournament is in DRAFT status");

        var set = await _db.PlayerSets
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId && s.Id == request.PlayerSetId);
        if (set == null)
            throw new InvalidOperationException("Invalid Player Set selected for this tournament");

        if (settings != null && request.BasePrice < settings.MinimumAcquisitionPrice)
            throw new InvalidOperationException($"Base price must be at least {settings.CurrencySymbol}{settings.MinimumAcquisitionPrice:N0}");

        var player = new Player
        {
            Id = Guid.NewGuid(),
            TournamentId = tournamentId,
            PlayerSetId = request.PlayerSetId,
            Name = request.Name.Trim(),
            PhotoUrl = string.IsNullOrWhiteSpace(request.PhotoUrl) ? null : request.PhotoUrl.Trim(),
            Age = request.Age,
            Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim(),
            PreferredFoot = string.IsNullOrWhiteSpace(request.PreferredFoot) ? null : request.PreferredFoot.Trim(),
            BasePrice = request.BasePrice,
            JerseyNumber = request.JerseyNumber,
            PreviousTeam = string.IsNullOrWhiteSpace(request.PreviousTeam) ? null : request.PreviousTeam.Trim(),
            ShortBio = string.IsNullOrWhiteSpace(request.ShortBio) ? null : request.ShortBio.Trim(),
            Status = "AVAILABLE",
            CreatedAtUtc = DateTime.UtcNow
        };

        _db.Players.Add(player);
        await _db.SaveChangesAsync();

        return new PlayerDto(
            player.Id,
            player.TournamentId,
            player.PlayerSetId,
            set.Name,
            player.Name,
            player.PhotoUrl,
            player.Age,
            player.Position,
            player.PreferredFoot,
            player.BasePrice,
            player.JerseyNumber,
            player.PreviousTeam,
            player.ShortBio,
            player.Status,
            player.CreatedAtUtc,
            player.UpdatedAtUtc
        );
    }

    public async Task<PlayerDto> UpdatePlayerAsync(Guid tournamentId, Guid playerId, UpdatePlayerRequest request, Guid userId)
    {
        var (tournament, settings) = await AssertCanManageTournamentAndGetSettingsAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Players can only be modified when tournament is in DRAFT status");

        var player = await _db.Players
            .Include(p => p.PlayerSet)
            .FirstOrDefaultAsync(p => p.TournamentId == tournamentId && p.Id == playerId);
        if (player == null)
            throw new KeyNotFoundException("Player not found");

        var set = await _db.PlayerSets
            .FirstOrDefaultAsync(s => s.TournamentId == tournamentId && s.Id == request.PlayerSetId);
        if (set == null)
            throw new InvalidOperationException("Invalid Player Set selected for this tournament");

        if (settings != null && request.BasePrice < settings.MinimumAcquisitionPrice)
            throw new InvalidOperationException($"Base price must be at least {settings.CurrencySymbol}{settings.MinimumAcquisitionPrice:N0}");

        player.Name = request.Name.Trim();
        player.PlayerSetId = request.PlayerSetId;
        player.PhotoUrl = string.IsNullOrWhiteSpace(request.PhotoUrl) ? null : request.PhotoUrl.Trim();
        player.Age = request.Age;
        player.Position = string.IsNullOrWhiteSpace(request.Position) ? null : request.Position.Trim();
        player.PreferredFoot = string.IsNullOrWhiteSpace(request.PreferredFoot) ? null : request.PreferredFoot.Trim();
        player.BasePrice = request.BasePrice;
        player.JerseyNumber = request.JerseyNumber;
        player.PreviousTeam = string.IsNullOrWhiteSpace(request.PreviousTeam) ? null : request.PreviousTeam.Trim();
        player.ShortBio = string.IsNullOrWhiteSpace(request.ShortBio) ? null : request.ShortBio.Trim();
        player.UpdatedAtUtc = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        return new PlayerDto(
            player.Id,
            player.TournamentId,
            player.PlayerSetId,
            set.Name,
            player.Name,
            player.PhotoUrl,
            player.Age,
            player.Position,
            player.PreferredFoot,
            player.BasePrice,
            player.JerseyNumber,
            player.PreviousTeam,
            player.ShortBio,
            player.Status,
            player.CreatedAtUtc,
            player.UpdatedAtUtc
        );
    }

    public async Task DeletePlayerAsync(Guid tournamentId, Guid playerId, Guid userId)
    {
        var (tournament, _) = await AssertCanManageTournamentAndGetSettingsAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Players can only be deleted when tournament is in DRAFT status");

        var player = await _db.Players
            .FirstOrDefaultAsync(p => p.TournamentId == tournamentId && p.Id == playerId);
        if (player == null)
            throw new KeyNotFoundException("Player not found");

        _db.Players.Remove(player);
        await _db.SaveChangesAsync();
    }

    public async Task<CsvPreviewResponse> PreviewCsvAsync(Guid tournamentId, Stream csvStream, Guid userId)
    {
        var (_, settings) = await AssertCanManageTournamentAndGetSettingsAsync(tournamentId, userId);

        var existingSets = await _db.PlayerSets
            .Where(s => s.TournamentId == tournamentId)
            .ToListAsync();

        var setLookup = existingSets.ToDictionary(s => s.Name.Trim().ToLower(), s => s);

        using var reader = new StreamReader(csvStream, Encoding.UTF8);
        var lines = new List<string>();
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                lines.Add(line);
            }
        }

        if (lines.Count == 0)
            return new CsvPreviewResponse(0, 0, 0, new List<CsvPlayerRowDto>());

        // Parse header
        var headerCols = ParseCsvLine(lines[0]);
        var colMap = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < headerCols.Count; i++)
        {
            var col = headerCols[i].Trim().Replace(" ", "").Replace("_", "").ToLower();
            colMap[col] = i;
        }

        int FindCol(params string[] aliases)
        {
            foreach (var a in aliases)
            {
                var clean = a.Replace(" ", "").Replace("_", "").ToLower();
                if (colMap.TryGetValue(clean, out var idx))
                    return idx;
            }
            return -1;
        }

        int nameIdx = FindCol("name", "playername", "player");
        int setIdx = FindCol("set", "playerset", "setname", "category");
        int priceIdx = FindCol("baseprice", "price", "base");
        int posIdx = FindCol("position", "pos", "role");
        int ageIdx = FindCol("age");
        int footIdx = FindCol("preferredfoot", "foot");
        int prevTeamIdx = FindCol("previousteam", "team", "club");
        int jerseyIdx = FindCol("jerseynumber", "jersey", "number", "kit");

        var rows = new List<CsvPlayerRowDto>();
        long minPrice = settings?.MinimumAcquisitionPrice ?? 10;

        for (int rowNum = 1; rowNum < lines.Count; rowNum++)
        {
            var parts = ParseCsvLine(lines[rowNum]);
            if (parts.Count == 0 || parts.All(string.IsNullOrWhiteSpace))
                continue;

            string GetVal(int idx) => (idx >= 0 && idx < parts.Count) ? parts[idx].Trim() : string.Empty;

            var rawName = GetVal(nameIdx);
            var rawSet = GetVal(setIdx);
            var rawPrice = GetVal(priceIdx);
            var rawPos = GetVal(posIdx);
            var rawAge = GetVal(ageIdx);
            var rawFoot = GetVal(footIdx);
            var rawPrevTeam = GetVal(prevTeamIdx);
            var rawJersey = GetVal(jerseyIdx);

            var errors = new List<string>();

            if (string.IsNullOrWhiteSpace(rawName))
            {
                errors.Add("Player name is required");
            }

            Guid? resolvedSetId = null;
            if (string.IsNullOrWhiteSpace(rawSet))
            {
                errors.Add("Set name is required");
            }
            else
            {
                if (setLookup.TryGetValue(rawSet.ToLower(), out var matchingSet))
                {
                    resolvedSetId = matchingSet.Id;
                }
                else
                {
                    errors.Add($"Set '{rawSet}' does not exist in this tournament");
                }
            }

            long basePrice = 0;
            if (string.IsNullOrWhiteSpace(rawPrice))
            {
                errors.Add("Base price is required");
            }
            else
            {
                var cleanPrice = rawPrice.Replace("₹", "").Replace("$", "").Replace(",", "").Trim();
                if (long.TryParse(cleanPrice, out var parsedPrice))
                {
                    basePrice = parsedPrice;
                    if (basePrice < minPrice)
                    {
                        errors.Add($"Base price ({basePrice}) is below minimum acquisition price ({minPrice})");
                    }
                }
                else
                {
                    errors.Add($"Invalid base price '{rawPrice}'");
                }
            }

            int? age = null;
            if (!string.IsNullOrWhiteSpace(rawAge) && int.TryParse(rawAge, out var parsedAge))
            {
                if (parsedAge is >= 10 and <= 70)
                    age = parsedAge;
                else
                    errors.Add($"Age must be between 10 and 70 (got {parsedAge})");
            }

            int? jersey = null;
            if (!string.IsNullOrWhiteSpace(rawJersey) && int.TryParse(rawJersey, out var parsedJersey))
            {
                if (parsedJersey is >= 1 and <= 99)
                    jersey = parsedJersey;
                else
                    errors.Add($"Jersey number must be between 1 and 99 (got {parsedJersey})");
            }

            bool isValid = errors.Count == 0;

            rows.Add(new CsvPlayerRowDto(
                rowNum,
                rawName,
                rawSet,
                basePrice,
                string.IsNullOrWhiteSpace(rawPos) ? null : rawPos,
                age,
                string.IsNullOrWhiteSpace(rawFoot) ? null : rawFoot,
                string.IsNullOrWhiteSpace(rawPrevTeam) ? null : rawPrevTeam,
                jersey,
                isValid,
                errors,
                resolvedSetId
            ));
        }

        var validCount = rows.Count(r => r.IsValid);
        var invalidCount = rows.Count - validCount;

        return new CsvPreviewResponse(rows.Count, validCount, invalidCount, rows);
    }

    public async Task<CsvImportResult> ImportCsvAsync(Guid tournamentId, CsvImportCommitRequest request, Guid userId)
    {
        var (tournament, _) = await AssertCanManageTournamentAndGetSettingsAsync(tournamentId, userId);
        if (tournament.Status != TournamentStatus.DRAFT)
            throw new InvalidOperationException("Players can only be imported when tournament is in DRAFT status");

        var validRows = request.Players
            .Where(p => p.IsValid && p.ResolvedPlayerSetId.HasValue && !string.IsNullOrWhiteSpace(p.Name))
            .ToList();

        if (validRows.Count == 0)
        {
            return new CsvImportResult(0, request.Players.Count, new List<string> { "No valid player rows to import" });
        }

        var newPlayers = validRows.Select(r => new Player
        {
            Id = Guid.NewGuid(),
            TournamentId = tournamentId,
            PlayerSetId = r.ResolvedPlayerSetId!.Value,
            Name = r.Name.Trim(),
            BasePrice = r.BasePrice,
            Position = r.Position?.Trim(),
            Age = r.Age,
            PreferredFoot = r.PreferredFoot?.Trim(),
            PreviousTeam = r.PreviousTeam?.Trim(),
            JerseyNumber = r.JerseyNumber,
            Status = "AVAILABLE",
            CreatedAtUtc = DateTime.UtcNow
        }).ToList();

        await _db.Players.AddRangeAsync(newPlayers);
        await _db.SaveChangesAsync();

        var messages = new List<string>
        {
            $"Successfully imported {newPlayers.Count} players."
        };

        var skippedCount = request.Players.Count - newPlayers.Count;
        if (skippedCount > 0)
        {
            messages.Add($"{skippedCount} invalid rows were skipped.");
        }

        return new CsvImportResult(newPlayers.Count, skippedCount, messages);
    }

    public byte[] GenerateCsvTemplate()
    {
        var csv = new StringBuilder();
        csv.AppendLine("Name,Set,BasePrice,Position,Age,PreferredFoot,PreviousTeam,JerseyNumber");
        csv.AppendLine("Arjun Nair,Marquee Players,5000,Forward,24,Right,Malabar United,10");
        csv.AppendLine("Mohammed Ashif,Midfielders,2000,Midfielder,22,Left,Calicut FC,8");
        csv.AppendLine("Rahul K,Defenders,1500,Defender,26,Right,Wayanad FC,4");
        csv.AppendLine("Bilal Ahmed,Goalkeepers,1000,Goalkeeper,25,Right,Kerala Blasters Youth,1");
        return Encoding.UTF8.GetBytes(csv.ToString());
    }

    private static List<string> ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];

            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    current.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        result.Add(current.ToString());
        return result;
    }

    private async Task<(Tournament tournament, TournamentSettings? settings)> AssertCanManageTournamentAndGetSettingsAsync(Guid tournamentId, Guid userId)
    {
        var tournament = await _db.Tournaments
            .Include(t => t.Settings)
            .FirstOrDefaultAsync(t => t.Id == tournamentId);

        if (tournament == null)
            throw new KeyNotFoundException("Tournament not found");

        var isOwner = tournament.OwnerUserId == userId;
        var isAuctioneer = await _db.TournamentMembers.AnyAsync(m =>
            m.TournamentId == tournamentId &&
            m.UserId == userId &&
            (m.Role == TournamentRole.OWNER || m.Role == TournamentRole.AUCTIONEER));

        if (!isOwner && !isAuctioneer)
            throw new UnauthorizedAccessException("Only tournament owners or auctioneers can manage players");

        return (tournament, tournament.Settings);
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
