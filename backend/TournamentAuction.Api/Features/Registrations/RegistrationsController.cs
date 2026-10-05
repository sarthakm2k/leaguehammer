using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace TournamentAuction.Api.Features.Registrations;

[ApiController]
public class RegistrationsController(RegistrationService service) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);
    private async Task<IActionResult> Run(Func<Task<object>> action)
    {
        try { return Ok(await action()); }
        catch (UnauthorizedAccessException ex) { return StatusCode(403, new { detail = ex.Message }); }
        catch (KeyNotFoundException ex) { return NotFound(new { detail = ex.Message }); }
        catch (ArgumentException ex) { return BadRequest(new { detail = ex.Message }); }
        catch (InvalidOperationException ex) { return Conflict(new { detail = ex.Message }); }
        catch (HttpRequestException) { return StatusCode(503, new { detail = "Photo storage is temporarily unavailable. Please retry; your details are preserved." }); }
    }
    [HttpGet("api/registration/{slug}")]
    [AllowAnonymous]
    public Task<IActionResult> PublicForm(string slug) => Run(async () => await service.GetPublicAsync(slug));
    [HttpGet("api/registration/{slug}/receipts/{submissionId:guid}")]
    [AllowAnonymous]
    [EnableRateLimiting("registrations")]
    public Task<IActionResult> Receipt(string slug, Guid submissionId) => Run(async () => await service.GetReceiptAsync(slug, submissionId));
    [HttpPost("api/registration/{slug}/submissions")]
    [AllowAnonymous]
    [EnableRateLimiting("registrations")]
    [RequestSizeLimit(4 * 1024 * 1024)]
    public Task<IActionResult> Submit(string slug, [FromForm] RegistrationSubmissionRequest request) => Run(async () => await service.SubmitAsync(slug, request));
    [Authorize]
    [HttpGet("api/tournaments/{id:guid}/registrations/settings")]
    public Task<IActionResult> Settings(Guid id) => Run(async () => await service.GetSettingsAsync(id, UserId));
    [Authorize]
    [HttpPut("api/tournaments/{id:guid}/registrations/settings")]
    public Task<IActionResult> Update(Guid id, RegistrationSettingsRequest request) => Run(async () => await service.UpdateSettingsAsync(id, UserId, request));
    [Authorize]
    [HttpGet("api/tournaments/{id:guid}/registrations")]
    public Task<IActionResult> List(Guid id) => Run(async () => await service.ListAsync(id, UserId));
    [Authorize]
    [HttpGet("api/tournaments/{id:guid}/registrations/{submissionId:guid}/photo")]
    public Task<IActionResult> Photo(Guid id, Guid submissionId) => Run(async () => await service.GetPhotoAsync(id, submissionId, UserId));
    [Authorize]
    [HttpPost("api/tournaments/{id:guid}/registrations/{submissionId:guid}/review")]
    public Task<IActionResult> Review(Guid id, Guid submissionId, RegistrationReviewRequest request) => Run(async () => await service.ReviewAsync(id, submissionId, UserId, request));
    [Authorize]
    [HttpPost("api/tournaments/{id:guid}/registrations/finalize")]
    public Task<IActionResult> FinalizeRegistration(Guid id) => Run(async () => await service.FinalizeAsync(id, UserId));
}
