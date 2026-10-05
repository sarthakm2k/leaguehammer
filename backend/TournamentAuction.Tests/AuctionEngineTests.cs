using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Auction;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Teams;
using TournamentAuction.Api.Features.Tournaments;
using Xunit;

namespace TournamentAuction.Tests;

public class AuctionEngineTests
{
    private (TournamentAuctionDbContext db, AuctionEngineService auctionService, TournamentService tournamentService, TeamService teamService, PlayerSetService setService, PlayerService playerService) CreateServices(string dbName)
    {
        var options = new DbContextOptionsBuilder<TournamentAuctionDbContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .Options;
        var db = new TournamentAuctionDbContext(options);
        var auctionService = new AuctionEngineService(db);
        var tournamentService = new TournamentService(db);
        var teamService = new TeamService(db);
        var setService = new PlayerSetService(db);
        var playerService = new PlayerService(db);
        return (db, auctionService, tournamentService, teamService, setService, playerService);
    }

    private async Task<(User user, Tournament tournament, Team team1, Team team2, PlayerSet set, List<Player> players)> SeedTournamentAsync(
        TournamentAuctionDbContext db, 
        TournamentService tournamentService, 
        TeamService teamService, 
        PlayerSetService setService, 
        PlayerService playerService, 
        int playerCount = 6, 
        int minSquad = 2, 
        int maxSquad = 4, 
        long initialPurse = 50000, 
        long minPrice = 500)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = $"organizer_{Guid.NewGuid():N}@test.com",
            FullName = "Auction Organizer",
            PasswordHash = "hash"
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var tournDto = await tournamentService.CreateTournamentAsync(
            new CreateTournamentRequest("Premier Auction League", "2026", null, null, null, null, null, null),
            user.Id
        );

        var tournament = await db.Tournaments
            .Include(t => t.Settings)
            .FirstAsync(t => t.Id == tournDto.Id);

        tournament.Settings!.MinimumSquadSize = minSquad;
        tournament.Settings.MaximumSquadSize = maxSquad;
        tournament.Settings.MinimumAcquisitionPrice = minPrice;
        tournament.Settings.DefaultStartingPurse = initialPurse;
        await db.SaveChangesAsync();

        var t1 = await teamService.CreateTeamAsync(tournament.Id, new CreateTeamRequest("Falcons FC", "FFC", null, "#F00", null, null, initialPurse), user.Id);
        var t2 = await teamService.CreateTeamAsync(tournament.Id, new CreateTeamRequest("Warriors FC", "WFC", null, "#00F", null, null, initialPurse), user.Id);

        var team1 = await db.Teams.FirstAsync(t => t.Id == t1.Id);
        var team2 = await db.Teams.FirstAsync(t => t.Id == t2.Id);

        var s1 = await setService.CreateSetAsync(tournament.Id, new CreatePlayerSetRequest("Marquee Stars", "Top players", 1), user.Id);
        var set = await db.PlayerSets.FirstAsync(s => s.Id == s1.Id);

        var players = new List<Player>();
        for (int i = 1; i <= playerCount; i++)
        {
            var p = await playerService.CreatePlayerAsync(tournament.Id, new CreatePlayerRequest(
                $"Player {i}",
                set.Id,
                minPrice * i,
                null,
                22 + i,
                "Forward",
                "Right",
                i,
                "Youth Academy",
                "Promising talent"
            ), user.Id);

            players.Add(await db.Players.FirstAsync(pl => pl.Id == p.Id));
        }

        // Ready for auction
        tournament.Status = TournamentStatus.READY;
        await db.SaveChangesAsync();

        return (user, tournament, team1, team2, set, players);
    }

    [Fact]
    public async Task StartAuction_TransitionsTournamentAndSessionToLive()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(StartAuction_TransitionsTournamentAndSessionToLive));
        var (user, tournament, _, _, _, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService);

        var state = await auctionService.StartAuctionAsync(tournament.Id, user.Id);

        Assert.Equal("LIVE", state.SessionStatus);
        Assert.Equal("LIVE", state.TournamentStatus);

        var sessionInDb = await db.AuctionSessions.FirstAsync(s => s.TournamentId == tournament.Id);
        Assert.Equal(AuctionSessionStatus.LIVE, sessionInDb.Status);
        Assert.NotNull(sessionInDb.StartedAtUtc);
    }

    [Fact]
    public async Task StartSet_RandomizesAndPersistsDrawPositions()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(StartSet_RandomizesAndPersistsDrawPositions));
        var (user, tournament, _, _, set, players) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 5);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        var state = await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        Assert.Equal(set.Id, state.CurrentSetId);

        var lots = await db.AuctionLots
            .Where(l => l.TournamentId == tournament.Id && l.PlayerSetId == set.Id)
            .OrderBy(l => l.DrawPosition)
            .ToListAsync();

        Assert.Equal(5, lots.Count);
        Assert.All(lots, l => Assert.Equal(AuctionLotStatus.PENDING, l.Status));

        // Check sequential draw positions 1 to 5
        var positions = lots.Select(l => l.DrawPosition).ToList();
        Assert.Equal(new[] { 1, 2, 3, 4, 5 }, positions);
    }

    [Fact]
    public async Task RevealNextPlayer_TransitionsToOnAuction_WithLowestDrawPosition()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(RevealNextPlayer_TransitionsToOnAuction_WithLowestDrawPosition));
        var (user, tournament, _, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 4);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        var state = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);

        Assert.NotNull(state.CurrentLot);
        Assert.Equal("ON_AUCTION", state.CurrentLot!.Status);
        Assert.Equal(1, state.CurrentLot.DrawPosition);

        var playerInDb = await db.Players.FindAsync(state.CurrentLot.PlayerId);
        Assert.Equal("ON_AUCTION", playerInDb!.Status);
    }

    [Fact]
    public async Task SellPlayer_UpdatesPurse_SquadSize_AndStandings()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(SellPlayer_UpdatesPurse_SquadSize_AndStandings));
        var (user, tournament, team1, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 4, initialPurse: 50000, minPrice: 500);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);
        var state1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);

        var lotId = state1.CurrentLot!.LotId;
        var salePrice = 5000;

        var state2 = await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(lotId, team1.Id, salePrice), user.Id);

        Assert.Null(state2.CurrentLot);
        var teamStanding = state2.TeamStandings.First(t => t.TeamId == team1.Id);
        Assert.Equal(1, teamStanding.CurrentSquadSize);
        Assert.Equal(salePrice, teamStanding.TotalSpent);
        Assert.Equal(50000 - salePrice, teamStanding.RemainingPurse);

        var lotInDb = await db.AuctionLots.FindAsync(lotId);
        Assert.Equal(AuctionLotStatus.SOLD, lotInDb!.Status);
        Assert.Equal(team1.Id, lotInDb.WinningTeamId);
        Assert.Equal(salePrice, lotInDb.FinalPrice);
    }

    [Fact]
    public async Task SellPlayer_RejectsWhenViolatingMinimumSquadReserveFloor()
    {
        // Setup: Team purse = 10,000, Min squad = 4, Min price = 1,000.
        // If current squad = 0, and team tries to buy Player 1:
        // Remaining slots to reach min squad 4 after purchase = 4 - (0 + 1) = 3 slots.
        // Required reserve = 3 * 1,000 = 3,000.
        // Maximum allowed purchase = 10,000 - 3,000 = 7,000.
        // A bid of 7,500 must be REJECTED with a descriptive explanation!
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(SellPlayer_RejectsWhenViolatingMinimumSquadReserveFloor));
        var (user, tournament, team1, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 4, minSquad: 4, maxSquad: 6, initialPurse: 10000, minPrice: 1000);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);
        var state1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);

        var lotId = state1.CurrentLot!.LotId;

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(lotId, team1.Id, 7500), user.Id)
        );

        Assert.Contains("maximum allowed purchase is", ex.Message.ToLower());
        Assert.Contains("must remain reserved", ex.Message.ToLower());
    }

    [Fact]
    public async Task SellPlayer_RejectsWhenExceedingMaximumSquadSize()
    {
        // Setup: Max squad = 2. Team buys 2 players. Attempting to buy 3rd player must fail.
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(SellPlayer_RejectsWhenExceedingMaximumSquadSize));
        var (user, tournament, team1, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 5, minSquad: 1, maxSquad: 2, initialPurse: 100000, minPrice: 500);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        // Player 1 -> SOLD
        var s1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(s1.CurrentLot!.LotId, team1.Id, Math.Max(2500, s1.CurrentLot.BasePrice)), user.Id);

        // Player 2 -> SOLD (reaches max squad 2)
        var s2 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(s2.CurrentLot!.LotId, team1.Id, Math.Max(2500, s2.CurrentLot.BasePrice)), user.Id);

        // Player 3 -> Attempt to sell to team1 must fail due to maximum squad size
        var s3 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(s3.CurrentLot!.LotId, team1.Id, Math.Max(2500, s3.CurrentLot.BasePrice)), user.Id)
        );

        Assert.Contains("cannot exceed the maximum squad limit", ex.Message);
    }

    [Fact]
    public async Task MarkUnsold_And_FinalUnsoldRound_Flow()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(MarkUnsold_And_FinalUnsoldRound_Flow));
        var (user, tournament, team1, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 3, minSquad: 1, maxSquad: 4, initialPurse: 50000, minPrice: 500);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        // Player 1 -> SOLD
        var p1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(p1.CurrentLot!.LotId, team1.Id, 2000), user.Id);

        // Player 2 -> UNSOLD
        var p2 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.MarkCurrentPlayerUnsoldAsync(tournament.Id, new MarkUnsoldRequest(p2.CurrentLot!.LotId), user.Id);

        // Player 3 -> UNSOLD
        var p3 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.MarkCurrentPlayerUnsoldAsync(tournament.Id, new MarkUnsoldRequest(p3.CurrentLot!.LotId), user.Id);

        // Complete the regular set
        var summary = await auctionService.CompleteSetAsync(tournament.Id, set.Id, user.Id);
        Assert.Equal(1, summary.SoldCount);
        Assert.Equal(2, summary.UnsoldCount);

        // Start Mandatory Final Unsold Round
        var unsoldRoundState = await auctionService.StartUnsoldRoundAsync(tournament.Id, user.Id);
        Assert.True(unsoldRoundState.IsUnsoldRound);

        // Reveal Player in Unsold Round (AttemptNumber = 2)
        var roundLot = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        Assert.Equal(2, roundLot.CurrentLot!.AttemptNumber);

        // Mark unsold in Attempt 2 -> status becomes FINAL_UNSOLD
        await auctionService.MarkCurrentPlayerUnsoldAsync(tournament.Id, new MarkUnsoldRequest(roundLot.CurrentLot.LotId), user.Id);

        var playerInDb = await db.Players.FindAsync(roundLot.CurrentLot.PlayerId);
        Assert.Equal("FINAL_UNSOLD", playerInDb!.Status);
    }

    [Fact]
    public async Task CorrectAuctionResult_UpdatesWinningTeamAndPrice_WithAuditTrail()
    {
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(CorrectAuctionResult_UpdatesWinningTeamAndPrice_WithAuditTrail));
        var (user, tournament, team1, team2, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 3, initialPurse: 50000, minPrice: 500);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        var p1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        var lotId = p1.CurrentLot!.LotId;

        // Originally sold to team1 for 2000
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(lotId, team1.Id, 2000), user.Id);

        // Correction: Human error - was actually won by team2 for 2500
        var correctedState = await auctionService.CorrectAuctionResultAsync(tournament.Id, new CorrectResultRequest(
            lotId,
            team2.Id,
            2500,
            "Auctioneer misheard bidder paddle"
        ), user.Id);

        var t1Standing = correctedState.TeamStandings.First(t => t.TeamId == team1.Id);
        var t2Standing = correctedState.TeamStandings.First(t => t.TeamId == team2.Id);

        Assert.Equal(0, t1Standing.CurrentSquadSize);
        Assert.Equal(0, t1Standing.TotalSpent);

        Assert.Equal(1, t2Standing.CurrentSquadSize);
        Assert.Equal(2500, t2Standing.TotalSpent);

        // Check audit event
        var events = await auctionService.GetAuctionEventsAsync(tournament.Id, user.Id);
        Assert.Contains(events, e => e.EventType == AuctionEventTypes.ResultCorrected && e.EventData.Contains("Auctioneer misheard bidder paddle"));
    }

    [Fact]
    public async Task CompleteAuction_EnforcesSquadMinimumOrRequiresOverride()
    {
        // Min squad is 2. team1 has 1 player, team2 has 0 players.
        var (db, auctionService, tournamentService, teamService, setService, playerService) = CreateServices(nameof(CompleteAuction_EnforcesSquadMinimumOrRequiresOverride));
        var (user, tournament, team1, _, set, _) = await SeedTournamentAsync(db, tournamentService, teamService, setService, playerService, playerCount: 2, minSquad: 2, maxSquad: 4, initialPurse: 50000, minPrice: 500);

        await auctionService.StartAuctionAsync(tournament.Id, user.Id);
        await auctionService.StartSetAsync(tournament.Id, new StartSetRequest(set.Id), user.Id);

        var p1 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(p1.CurrentLot!.LotId, team1.Id, 2000), user.Id);

        var p2 = await auctionService.RevealNextPlayerAsync(tournament.Id, user.Id);
        await auctionService.SellCurrentPlayerAsync(tournament.Id, new SellPlayerRequest(p2.CurrentLot!.LotId, team1.Id, 2000), user.Id);

        await auctionService.CompleteSetAsync(tournament.Id, set.Id, user.Id);

        // Attempting to complete auction without override reason fails because team2 has 0 players (< minSquad 2)
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            auctionService.CompleteAuctionAsync(tournament.Id, null, user.Id)
        );
        Assert.Contains("did not reach the minimum squad size", ex.Message);

        // Completing with explicit override reason succeeds!
        var completedState = await auctionService.CompleteAuctionAsync(tournament.Id, new CompleteAuctionRequest(
            "Tournament committee agreed to allow understrength squad for second division"
        ), user.Id);

        Assert.Equal("COMPLETED", completedState.SessionStatus);
        Assert.Equal("COMPLETED", completedState.TournamentStatus);
    }
}
