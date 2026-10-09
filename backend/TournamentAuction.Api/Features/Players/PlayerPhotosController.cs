using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using TournamentAuction.Api.Hubs;

namespace TournamentAuction.Api.Features.Players;

[ApiController]
[Authorize]
[Route("api/tournaments/{tournamentId:guid}/players/{playerId:guid}/photo")]
public class PlayerPhotosController(PlayerPhotoService photos, IHubContext<AuctionHub> hub) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public Task<IActionResult> Upload(Guid tournamentId, Guid playerId, [FromForm] IFormFile photo) => photo == null ? Task.FromResult<IActionResult>(BadRequest(new { detail = "Choose a player photo to upload." })) : Change(tournamentId, playerId, photo);

    [HttpDelete]
    public Task<IActionResult> Remove(Guid tournamentId, Guid playerId) => Change(tournamentId, playerId, null);

    private async Task<IActionResult> Change(Guid tournamentId, Guid playerId, IFormFile? photo)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId)) return Unauthorized();
        try
        {
            string? url = null;
            if (photo != null) url = await photos.UploadAsync(tournamentId, playerId, userId, photo);
            else await photos.RemoveAsync(tournamentId, playerId, userId);
            // Both authenticated and public viewers refresh their canonical player data.
            await hub.Clients.Groups(AuctionHub.AdminGroup(tournamentId), AuctionHub.PublicGroup(tournamentId)).SendAsync("TeamUpdated");
            return Ok(new { photoUrl = url });
        }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { detail = ex.Message }); }
        catch (InvalidOperationException ex) { return BadRequest(new { detail = ex.Message }); }
        catch (HttpRequestException) { return StatusCode(503, new { detail = "Photo storage is temporarily unavailable. The existing photo has not changed; please retry." }); }
        catch (TaskCanceledException) { return StatusCode(503, new { detail = "Photo storage timed out. Please retry." }); }
    }
}
