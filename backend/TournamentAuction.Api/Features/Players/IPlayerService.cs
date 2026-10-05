namespace TournamentAuction.Api.Features.Players;

public interface IPlayerService
{
    Task<PagedPlayersDto> GetPlayersAsync(Guid tournamentId, PlayerFilterRequest filter, Guid userId);
    Task<PlayerDto> GetPlayerByIdAsync(Guid tournamentId, Guid playerId, Guid userId);
    Task<PlayerDto> CreatePlayerAsync(Guid tournamentId, CreatePlayerRequest request, Guid userId);
    Task<PlayerDto> UpdatePlayerAsync(Guid tournamentId, Guid playerId, UpdatePlayerRequest request, Guid userId);
    Task DeletePlayerAsync(Guid tournamentId, Guid playerId, Guid userId);
    Task<CsvPreviewResponse> PreviewCsvAsync(Guid tournamentId, Stream csvStream, Guid userId);
    Task<CsvImportResult> ImportCsvAsync(Guid tournamentId, CsvImportCommitRequest request, Guid userId);
    byte[] GenerateCsvTemplate();
}
