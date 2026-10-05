using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace TournamentAuction.Api.Features.BasePriceTiers;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/base-price-tiers")]
[Authorize]
public class BasePriceTiersController : ControllerBase
{
    private readonly IBasePriceTierService _tierService;

    public BasePriceTiersController(IBasePriceTierService tierService)
    {
        _tierService = tierService;
    }

    [HttpGet]
    public async Task<IActionResult> GetTiers(Guid tournamentId)
    {
        var userId = GetCurrentUserId();
        try
        {
            var tiers = await _tierService.GetTiersAsync(tournamentId, userId);
            return Ok(tiers);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateTier(Guid tournamentId, [FromBody] CreateBasePriceTierRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var tier = await _tierService.CreateTierAsync(tournamentId, request, userId);
            return CreatedAtAction(nameof(GetTiers), new { tournamentId }, tier);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { title = "Cannot create tier", detail = ex.Message });
        }
    }

    [HttpDelete("{tierId:guid}")]
    public async Task<IActionResult> DeleteTier(Guid tournamentId, Guid tierId)
    {
        var userId = GetCurrentUserId();
        try
        {
            await _tierService.DeleteTierAsync(tournamentId, tierId, userId);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
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
