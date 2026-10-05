using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Auction;

[ApiController]
[Authorize]
[Route("api/tournaments/{tournamentId:guid}")]
public class AuctionResultsController(IAuctionEngineService auction) : ControllerBase
{
    [HttpGet("results")]
    public Task<IActionResult> Results(Guid tournamentId) => Read(tournamentId, false);
    [HttpGet("statistics")]
    public Task<IActionResult> Statistics(Guid tournamentId) => Read(tournamentId, true);

    private async Task<IActionResult> Read(Guid tournamentId, bool statisticsOnly)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        try
        {
            var results = await auction.GetAuctionResultsAsync(tournamentId, userId);
            return Ok(statisticsOnly ? (object)results.Statistics : results);
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
    }
}

[ApiController]
[AllowAnonymous]
[Route("api/public/tournaments/{tournamentKey}")]
public class PublicAuctionResultsController(IAuctionEngineService auction) : ControllerBase
{
    [HttpGet]
    [HttpGet("results")]
    public async Task<IActionResult> Results(string tournamentKey)
    {
        try { return Ok(await auction.GetPublicAuctionResultsAsync(tournamentKey)); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
    }

    [HttpGet("teams/{teamId:guid}")]
    public async Task<IActionResult> Team(string tournamentKey, Guid teamId)
    {
        try
        {
            var results = await auction.GetPublicAuctionResultsAsync(tournamentKey);
            var team = results.Statistics.Teams.FirstOrDefault(t => t.Standing.TeamId == teamId);
            if (team == null) return NotFound(new { detail = "Franchise not found in this tournament." });
            return Ok(new TeamSquadDto(results.State.TournamentId, results.State.TournamentName, results.State.Slug,
                results.State.SessionStatus, results.State.CurrencyCode, results.State.CurrencySymbol, team,
                results.Players.Where(p => p.WinningTeamId == teamId && p.Status == "SOLD").OrderByDescending(p => p.FinalPrice).ToList()));
        }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
    }
}
