using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace TournamentAuction.Api.Features.Players;

[ApiController]
[Route("api/tournaments/{tournamentId:guid}/players")]
[Authorize]
public class PlayersController : ControllerBase
{
    private readonly IPlayerService _playerService;

    public PlayersController(IPlayerService playerService)
    {
        _playerService = playerService;
    }

    [HttpGet]
    public async Task<IActionResult> GetPlayers(
        Guid tournamentId,
        [FromQuery] string? search,
        [FromQuery] Guid? playerSetId,
        [FromQuery] string? position,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        try
        {
            var userId = GetCurrentUserId();
            var filter = new PlayerFilterRequest(search, playerSetId, position, page, pageSize);
            var result = await _playerService.GetPlayersAsync(tournamentId, filter, userId);
            return Ok(result);
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
    public async Task<IActionResult> GetPlayerById(Guid tournamentId, Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var player = await _playerService.GetPlayerByIdAsync(tournamentId, id, userId);
            return Ok(player);
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
    public async Task<IActionResult> CreatePlayer(Guid tournamentId, [FromBody] CreatePlayerRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var created = await _playerService.CreatePlayerAsync(tournamentId, request, userId);
            return CreatedAtAction(nameof(GetPlayerById), new { tournamentId, id = created.Id }, created);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> UpdatePlayer(Guid tournamentId, Guid id, [FromBody] UpdatePlayerRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var updated = await _playerService.UpdatePlayerAsync(tournamentId, id, request, userId);
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
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeletePlayer(Guid tournamentId, Guid id)
    {
        try
        {
            var userId = GetCurrentUserId();
            await _playerService.DeletePlayerAsync(tournamentId, id, userId);
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
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpPost("csv-preview")]
    public async Task<IActionResult> PreviewCsv(Guid tournamentId)
    {
        try
        {
            var userId = GetCurrentUserId();
            Stream stream;

            if (Request.HasFormContentType && Request.Form.Files.Count > 0)
            {
                var file = Request.Form.Files[0];
                stream = file.OpenReadStream();
            }
            else if (Request.Body != null && Request.ContentLength > 0)
            {
                stream = Request.Body;
            }
            else
            {
                return BadRequest(new { detail = "CSV file or body content is required" });
            }

            var preview = await _playerService.PreviewCsvAsync(tournamentId, stream, userId);
            return Ok(preview);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (Exception ex)
        {
            return BadRequest(new { detail = $"Failed to parse CSV: {ex.Message}" });
        }
    }

    [HttpPost("csv-import")]
    public async Task<IActionResult> ImportCsv(Guid tournamentId, [FromBody] CsvImportCommitRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _playerService.ImportCsvAsync(tournamentId, request, userId);
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return Forbid(ex.Message);
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { detail = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { detail = ex.Message });
        }
    }

    [HttpGet("csv-template")]
    [AllowAnonymous]
    public IActionResult DownloadTemplate(Guid tournamentId)
    {
        var bytes = _playerService.GenerateCsvTemplate();
        return File(bytes, "text/csv", "players_import_template.csv");
    }

    private Guid GetCurrentUserId()
    {
        var claim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(claim) || !Guid.TryParse(claim, out var userId))
            throw new UnauthorizedAccessException("Invalid user context");
        return userId;
    }
}
