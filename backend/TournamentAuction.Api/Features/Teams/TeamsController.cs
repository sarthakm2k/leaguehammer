using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace TournamentAuction.Api.Features.Teams;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/teams")]
[Authorize]
public class TeamsController : ControllerBase
{
    private readonly ITeamService _teamService;

    public TeamsController(ITeamService teamService)
    {
        _teamService = teamService;
    }

    [HttpGet]
    public async Task<IActionResult> GetTeams(Guid tournamentId)
    {
        var userId = GetCurrentUserId();
        try
        {
            var teams = await _teamService.GetTeamsAsync(tournamentId, userId);
            return Ok(teams);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
    }

    [HttpGet("{teamId:guid}")]
    public async Task<IActionResult> GetTeam(Guid tournamentId, Guid teamId)
    {
        var userId = GetCurrentUserId();
        try
        {
            var team = await _teamService.GetTeamByIdAsync(tournamentId, teamId, userId);
            if (team == null) return NotFound(new { title = "Team not found" });
            return Ok(team);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
    }

    [HttpPost]
    public async Task<IActionResult> CreateTeam(Guid tournamentId, [FromBody] CreateTeamRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var team = await _teamService.CreateTeamAsync(tournamentId, request, userId);
            return CreatedAtAction(nameof(GetTeam), new { tournamentId, teamId = team.Id }, team);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = "Invalid team data", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { title = "Cannot create team", detail = ex.Message });
        }
    }

    [HttpPut("{teamId:guid}")]
    public async Task<IActionResult> UpdateTeam(Guid tournamentId, Guid teamId, [FromBody] UpdateTeamRequest request)
    {
        var userId = GetCurrentUserId();
        try
        {
            var team = await _teamService.UpdateTeamAsync(tournamentId, teamId, request, userId);
            return Ok(team);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { title = "Invalid team data", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { title = "Cannot update team", detail = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { title = "Not found", detail = ex.Message });
        }
    }

    [HttpDelete("{teamId:guid}")]
    public async Task<IActionResult> DeleteTeam(Guid tournamentId, Guid teamId)
    {
        var userId = GetCurrentUserId();
        try
        {
            await _teamService.DeleteTeamAsync(tournamentId, teamId, userId);
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { title = "Forbidden", detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { title = "Cannot delete team", detail = ex.Message });
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
