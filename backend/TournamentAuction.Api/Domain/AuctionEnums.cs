namespace TournamentAuction.Api.Domain;

public enum AuctionSessionStatus
{
    READY,
    LIVE,
    PAUSED,
    COMPLETED
}

public enum AuctionLotStatus
{
    PENDING,
    ON_AUCTION,
    SOLD,
    UNSOLD,
    CANCELLED
}

public static class AuctionEventTypes
{
    public const string AuctionStarted = "AUCTION_STARTED";
    public const string AuctionPaused = "AUCTION_PAUSED";
    public const string AuctionResumed = "AUCTION_RESUMED";
    public const string SetStarted = "SET_STARTED";
    public const string PlayerRevealed = "PLAYER_REVEALED";
    public const string PlayerSold = "PLAYER_SOLD";
    public const string PlayerUnsold = "PLAYER_UNSOLD";
    public const string ResultCorrected = "RESULT_CORRECTED";
    public const string SetCompleted = "SET_COMPLETED";
    public const string UnsoldRoundStarted = "UNSOLD_ROUND_STARTED";
    public const string AuctionCompleted = "AUCTION_COMPLETED";
}
