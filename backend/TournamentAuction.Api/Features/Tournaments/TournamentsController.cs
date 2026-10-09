using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace TournamentAuction.Api.Features.Tournaments;

[ApiController]
[Route("api/tournaments")]
[Authorize]
public class TournamentsController : ControllerBase
{
    private readonly ITournamentService _tournamentService;

    public TournamentsController(ITournamentService tournamentService)
    {
        _tournamentService = tournamentService;
    }

    [HttpGet]
    public async Task<IActionResult> GetMyTournaments()
    {
        var userId = GetCurrentUserId();
        var tournaments = await _tournamentService.GetTournamentsForUserAsync(userId);
        return Ok(tournaments);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetTournament(Guid id)
    {
        var userId = GetCurrentUserId();
        var tournament = await _tournamentService.GetTournamentByIdAsync(id, userId);
        if (tournament == null)
        {
            return NotFound(new { title = "Tournament not found", detail = "Tournament does not exist or you do not have permission to view it." });
        }
        return Ok(tournament);
    }

    [HttpPost]
    public async Task<IActionResult> CreateTournament([FromBody] CreateTournamentRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var tournament = await _tournamentService.CreateTournamentAsync(request, userId);
            return CreatedAtAction(nameof(GetTournament), new { id = tournament.Id }, tournament);
        }
        catch (Exception ex)
        {
            return BadRequest(new { title = "Could not create tournament", detail = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdateTournament(Guid id, [FromBody] UpdateTournamentRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var updated = await _tournamentService.UpdateTournamentAsync(id, request, userId);
            return Ok(updated);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { title = "Not found", detail = ex.Message });
        }
    }

    [HttpPost("{id:guid}/clone")]
    public async Task<IActionResult> CloneTournament(Guid id, [FromBody] CloneTournamentRequest request)
    {
        try
        {
            var clone = await _tournamentService.CloneTournamentAsync(id, request, GetCurrentUserId());
            return CreatedAtAction(nameof(GetTournament), new { id = clone.Id }, clone);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { title = "Not found", detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = "Cannot clone tournament", detail = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteTournament(Guid id)
    {
        var userId = GetCurrentUserId();
        try
        {
            await _tournamentService.DeleteTournamentAsync(id, userId);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { title = "Cannot delete tournament", detail = ex.Message });
        }
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirstValue(ClaimTypes.NameIdentifier) 
            ?? User.FindFirstValue("sub");

        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var userId))
        {
            throw new UnauthorizedAccessException("User identity claim missing from token.");
        }
        return userId;
    }
}
