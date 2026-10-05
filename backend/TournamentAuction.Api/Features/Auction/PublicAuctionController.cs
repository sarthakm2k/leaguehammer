using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Auction;

[ApiController]
[AllowAnonymous]
[Route("api/public/tournaments/{tournamentKey}/auction-state")]
public class PublicAuctionController(IAuctionEngineService auction) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetState(string tournamentKey)
    {
        try { return Ok(await auction.GetPublicAuctionStateAsync(tournamentKey)); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
    }
}
