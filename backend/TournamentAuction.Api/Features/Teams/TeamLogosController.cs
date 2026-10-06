using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Api.Features.Teams;

[ApiController]
[Authorize]
[Route("api/tournaments/{tournamentId:guid}/teams/{teamId:guid}/logo")]
public class TeamLogosController(TeamLogoService service, TournamentAuctionDbContext db,
    IHubContext<AuctionHub> hub, ILogger<TeamLogosController> logger) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(3 * 1024 * 1024 + 65536)]
    [RequestFormLimits(MultipartBodyLengthLimit = 3 * 1024 * 1024 + 65536)]
    public async Task<IActionResult> Upload(Guid tournamentId, Guid teamId, [FromForm] IFormFile logo)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub"), out var userId))
            return Unauthorized();
        try
        {
            var logoUrl = await service.UploadAsync(tournamentId, teamId, userId, logo);
            try
            {
                await hub.Clients.Group(AuctionHub.AdminGroup(tournamentId)).SendAsync("TeamUpdated");
                if (await db.TournamentSettings.AnyAsync(s => s.TournamentId == tournamentId && s.PublicLiveViewEnabled))
                    await hub.Clients.Group(AuctionHub.PublicGroup(tournamentId)).SendAsync("TeamUpdated");
            }
            catch (Exception ex) { logger.LogWarning(ex, "Team logo saved but live notification failed for {TeamId}", teamId); }
            return Ok(new { logoUrl });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { detail = ex.Message }); }
        catch (InvalidOperationException ex) { return StatusCode(503, new { detail = ex.Message }); }
        catch (HttpRequestException) { return StatusCode(503, new { detail = "Logo storage is temporarily unavailable. Please retry." }); }
    }
}
