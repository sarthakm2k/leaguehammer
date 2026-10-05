using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Auction;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/auction")]
[Authorize]
public class AuctionController : ControllerBase
{
    private readonly IAuctionEngineService _auctionService;

    public AuctionController(IAuctionEngineService auctionService)
    {
        _auctionService = auctionService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAuctionState(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.GetAuctionStateAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("start")]
    public async Task<IActionResult> StartAuction(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.StartAuctionAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("pause")]
    public async Task<IActionResult> PauseAuction(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.PauseAuctionAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("resume")]
    public async Task<IActionResult> ResumeAuction(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.ResumeAuctionAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("start-set")]
    public async Task<IActionResult> StartSet(Guid tournamentId, [FromBody] StartSetRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.StartSetAsync(tournamentId, request, userId);
            return Ok(state);
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

    [HttpPost("reveal-next")]
    public async Task<IActionResult> RevealNextPlayer(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.RevealNextPlayerAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("sell")]
    public async Task<IActionResult> SellPlayer(Guid tournamentId, [FromBody] SellPlayerRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.SellCurrentPlayerAsync(tournamentId, request, userId);
            return Ok(state);
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

    [HttpPost("unsold")]
    public async Task<IActionResult> MarkUnsold(Guid tournamentId, [FromBody] MarkUnsoldRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.MarkCurrentPlayerUnsoldAsync(tournamentId, request, userId);
            return Ok(state);
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

    [HttpPost("sets/{setId:guid}/complete")]
    public async Task<IActionResult> CompleteSet(Guid tournamentId, Guid setId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var summary = await _auctionService.CompleteSetAsync(tournamentId, setId, userId);
            return Ok(summary);
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

    [HttpPost("unsold-round/start")]
    public async Task<IActionResult> StartUnsoldRound(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.StartUnsoldRoundAsync(tournamentId, userId);
            return Ok(state);
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

    [HttpPost("correct-result")]
    public async Task<IActionResult> CorrectResult(Guid tournamentId, [FromBody] CorrectResultRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.CorrectAuctionResultAsync(tournamentId, request, userId);
            return Ok(state);
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

    [HttpPost("complete")]
    public async Task<IActionResult> CompleteAuction(Guid tournamentId, [FromBody] CompleteAuctionRequest? request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var state = await _auctionService.CompleteAuctionAsync(tournamentId, request, userId);
            return Ok(state);
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

    [HttpGet("events")]
    public async Task<IActionResult> GetEvents(Guid tournamentId, [FromQuery] int take = 50)
    {
        try
        {
            var userId = GetCurrentUserId();
            var events = await _auctionService.GetAuctionEventsAsync(tournamentId, userId, take);
            return Ok(events);
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

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var userId))
        {
            throw new UnauthorizedAccessException("Invalid or missing user identity.");
        }
        return userId;
    }
}
