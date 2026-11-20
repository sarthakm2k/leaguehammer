using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Teams;

[ApiController, Authorize, Route("api/tournaments/{tournamentId:guid}/teams/{teamId:guid}/assignments")]
public class TeamAssignmentsController(TeamAssignmentService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
    private async Task<IActionResult> Run(Func<Task<TeamAssignmentsDto>> action)
    {
        try {return Ok(await action());}
        catch (UnauthorizedAccessException ex) {return StatusCode(403,new {detail=ex.Message});}
        catch (KeyNotFoundException ex) {return NotFound(new {detail=ex.Message});}
        catch (ArgumentException ex) {return BadRequest(new {detail=ex.Message});}
        catch (InvalidOperationException ex) {return Conflict(new {detail=ex.Message});}
    }
    [HttpGet] public Task<IActionResult> Get(Guid tournamentId, Guid teamId) => Run(() => service.GetAsync(tournamentId,teamId,UserId));
    [HttpPut] public Task<IActionResult> Update(Guid tournamentId, Guid teamId, TeamAssignmentsRequest request) => Run(() => service.UpdateAsync(tournamentId,teamId,UserId,request));
}
