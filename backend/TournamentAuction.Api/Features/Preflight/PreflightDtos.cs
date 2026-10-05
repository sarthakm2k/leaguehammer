namespace TournamentAuction.Api.Features.Preflight;

public record PreflightCheckItem(
    string Key,
    string Category, // "Settings", "Teams", "Sets", "Players", "Feasibility"
    string Title,
    string Status, // "PASS", "FAIL", "WARN"
    string Message,
    string? FixHint = null
);

public record PreflightMetrics(
    int TotalTeams,
    int MinimumSquadSize,
    int MaximumSquadSize,
    int RequiredPlayersForMinSquad,
    int TotalPlayers,
    int TotalSets,
    int EmptySetsCount,
    long MinimumAcquisitionPrice,
    long MinimumPurseRequiredPerTeam,
    long TotalPurseAcrossTeams,
    int PlayersWithoutPhotosCount
);

public record PreflightReportDto(
    Guid TournamentId,
    string TournamentName,
    string TournamentStatus,
    bool IsReadyForAuction,
    int CriticalErrorsCount,
    int WarningsCount,
    PreflightMetrics Metrics,
    List<PreflightCheckItem> Checks,
    List<string> BlockingErrors,
    List<string> Warnings
);
