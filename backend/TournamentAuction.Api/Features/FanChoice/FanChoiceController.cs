using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace TournamentAuction.Api.Features.FanChoice;

[ApiController]
public class FanChoiceController(FanChoiceService service) : ControllerBase
{
    private Guid UserId => Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : throw new UnauthorizedAccessException("Sign in to manage Fan Choice.");
    private string? BrowserToken => Request.Headers["X-Fan-Voter"].FirstOrDefault();

    private async Task<IActionResult> Run<T>(Func<Task<T>> action)
    {
        try { return Ok(await action()); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { detail = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { detail = ex.Message }); }
    }

    [Authorize, HttpGet("api/tournaments/{id:guid}/fan-choice")]
    public Task<IActionResult> Admin(Guid id) => Run(() => service.GetAdminAsync(id, UserId));

    [Authorize, HttpPut("api/tournaments/{id:guid}/fan-choice/{category}")]
    public Task<IActionResult> Configure(Guid id, string category, FanChoiceSettingsRequest request) => Run(() => service.ConfigureAsync(id, UserId, category, request));

    [AllowAnonymous, HttpGet("api/public/tournaments/{slug}/fan-choice")]
    public Task<IActionResult> Public(string slug) => Run(() => service.GetPublicAsync(slug, BrowserToken));

    [AllowAnonymous, EnableRateLimiting("fan-choice-write"), HttpPost("api/public/tournaments/{slug}/fan-choice/{pollId:guid}/votes")]
    public Task<IActionResult> Vote(string slug, Guid pollId, FanChoiceVoteRequest request) => Run(() => service.VoteAsync(slug, pollId, BrowserToken, request.OptionId));
}
