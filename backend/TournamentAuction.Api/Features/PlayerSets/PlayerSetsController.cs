using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.PlayerSets;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/player-sets")]
[Authorize]
public class PlayerSetsController : ControllerBase
{
    private readonly IPlayerSetService _playerSetService;

    public PlayerSetsController(IPlayerSetService playerSetService)
    {
        _playerSetService = playerSetService;
    }

    [HttpGet]
    public async Task<IActionResult> GetSets(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var sets = await _playerSetService.GetSetsAsync(tournamentId, userId);
            return Ok(sets);
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

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetSetById(Guid tournamentId, Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var set = await _playerSetService.GetSetByIdAsync(tournamentId, id, userId);
            return Ok(set);
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

    [HttpPost]
    public async Task<IActionResult> CreateSet(Guid tournamentId, [FromBody] CreatePlayerSetRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var created = await _playerSetService.CreateSetAsync(tournamentId, request, userId);
            return CreatedAtAction(nameof(GetSetById), new { tournamentId, id = created.Id }, created);
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

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateSet(Guid tournamentId, Guid id, [FromBody] UpdatePlayerSetRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _playerSetService.UpdateSetAsync(tournamentId, id, request, userId);
            return Ok(updated);
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

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteSet(Guid tournamentId, Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            await _playerSetService.DeleteSetAsync(tournamentId, id, userId);
            return NoContent();
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

    [HttpPut("reorder")]
    public async Task<IActionResult> ReorderSets(Guid tournamentId, [FromBody] ReorderPlayerSetsRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            await _playerSetService.ReorderSetsAsync(tournamentId, request, userId);
            return NoContent();
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
