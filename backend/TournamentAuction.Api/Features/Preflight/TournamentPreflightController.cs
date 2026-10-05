using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Preflight;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/preflight")]
[Authorize]
public class TournamentPreflightController : ControllerBase
{
    private readonly ITournamentPreflightService _preflightService;

    public TournamentPreflightController(ITournamentPreflightService preflightService)
    {
        _preflightService = preflightService;
    }

    [HttpGet]
    public async Task<IActionResult> GetPreflight(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var report = await _preflightService.RunPreflightAsync(tournamentId, userId);
            return Ok(report);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
    }

    [HttpPost("approve-ready")]
    public async Task<IActionResult> ApproveReady(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var report = await _preflightService.ApproveReadyForAuctionAsync(tournamentId, userId);
            return Ok(report);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("return-to-draft")]
    public async Task<IActionResult> ReturnToDraft(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var report = await _preflightService.ReturnToDraftAsync(tournamentId, userId);
            return Ok(report);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var userId))
            throw new UnauthorizedAccessException("Invalid user context");
        return userId;
    }
}
