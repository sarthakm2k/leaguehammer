using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Registrations;

[ApiController]
[ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
public class RegistrationViewerController(RegistrationViewerService service) : ControllerBase
{
    private async Task<IActionResult> Run(Func<Task<IActionResult>> action)
    {
        try { return await action(); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
        catch (InvalidOperationException) { return StatusCode(503, new { detail = "Player photos are temporarily unavailable." }); }
        catch (HttpRequestException) { return StatusCode(503, new { detail = "Player photos are temporarily unavailable." }); }
        catch (TaskCanceledException) { return StatusCode(503, new { detail = "Player photos are temporarily unavailable." }); }
    }

    [Authorize]
    [HttpGet("api/tournaments/{id:guid}/registrations/view-link")]
    public Task<IActionResult> Link(Guid id) => Run(async () => Ok(await service.GetLinkAsync(id,
        Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!))));

    [AllowAnonymous]
    [HttpGet("api/registration/{slug}/view/{viewToken}")]
    public Task<IActionResult> List(string slug, string viewToken) => Run(async () => Ok(await service.ListAsync(slug, viewToken)));

    [AllowAnonymous]
    [HttpGet("api/registration/{slug}/view/{viewToken}/players/{playerId:guid}/photo")]
    public Task<IActionResult> Photo(string slug, string viewToken, Guid playerId) => Run(async () =>
        Redirect(await service.PhotoAsync(slug, viewToken, playerId)));
}
