using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace TournamentAuction.Api.Features.Settings;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/settings")]
[Authorize]
public class TournamentSettingsController : ControllerBase
{
    private readonly ITournamentSettingsService _settingsService;

    public TournamentSettingsController(ITournamentSettingsService settingsService)
    {
        _settingsService = settingsService;
    }

    [HttpGet]
    public async Task<IActionResult> GetSettings(Guid tournamentId)
    {
        var userId = GetCurrentUserId();
        try
        {
            var settings = await _settingsService.GetSettingsAsync(tournamentId, userId);
            return Ok(settings);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
    }

    [HttpPut]
    public async Task<IActionResult> UpdateSettings(Guid tournamentId, [FromBody] UpdateTournamentSettingsRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var settings = await _settingsService.UpdateSettingsAsync(tournamentId, request, userId);
            return Ok(settings);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = "Invalid settings configuration", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { title = "Cannot modify settings", detail = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { title = "Not found", detail = ex.Message });
        }
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var userId))
        {
            throw new UnauthorizedAccessException("User identity claim missing.");
        }
        return userId;
    }
}
