using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Players;

namespace TournamentAuction.Api.Features.Registrations;

public class RegistrationService(TournamentAuctionDbContext db, IPlayerService players,
    IRegistrationPhotoStorage photos, TimeProvider clock)
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static string Phone(string s) => new(s.Where(char.IsAsciiDigit).ToArray());
    private static void Validate(string name, string phone, string position, string? foot)
    {
        if (name.Trim().Length < 2) throw new ArgumentException("Enter the player's full name.");
        if (Phone(phone).Length is < 7 or > 15) throw new ArgumentException("Enter a valid contact number including the country code.");
        if (!new[] { "Goalkeeper", "Defender", "Midfielder", "Forward" }.Contains(position)) throw new ArgumentException("Select a playing position.");
        if (Clean(foot) is { } f && !new[] { "Right", "Left", "Both" }.Contains(f)) throw new ArgumentException("Select a valid preferred foot.");
    }
    private async Task<Tournament> Tournament(Guid id, Guid user)
    {
        var t = await db.Tournaments.SingleOrDefaultAsync(t => t.Id == id) ?? throw new KeyNotFoundException("Tournament not found.");
        if (t.OwnerUserId != user && !await db.TournamentMembers.AnyAsync(m => m.TournamentId == id && m.UserId == user && (m.Role == TournamentRole.OWNER || m.Role == TournamentRole.AUCTIONEER)))
            throw new UnauthorizedAccessException("Only tournament owners and auctioneers can manage registrations.");
        return t;
    }
    // Serialize form closing, submission and approval on PostgreSQL, including concurrent retries.
    private async Task<IDbContextTransaction?> Lock(Guid tournamentId)
    {
        if (!db.Database.IsRelational()) return null;
        var tx = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT 1 FROM \"Tournaments\" WHERE \"Id\" = {tournamentId} FOR UPDATE");
        return tx;
    }
    private string Status(Tournament t, RegistrationForm? f) => f?.FinalizedAtUtc != null ? "FINALIZED" :
        t.Status != TournamentStatus.DRAFT || f is not { Enabled: true } || f.ClosedManually ? "CLOSED" :
        f.OpensAtUtc > Now ? "SCHEDULED" : f.ClosesAtUtc <= Now ? "CLOSED" : "OPEN";
    private RegistrationFormDto FormDto(Tournament t, RegistrationForm? f) => new(t.Id, t.Name, t.Slug, t.TimeZone,
        f?.Enabled ?? false, f?.OpensAtUtc, f?.ClosesAtUtc, f?.ClosedManually ?? false, f?.FinalizedAtUtc,
        f?.Instructions, Status(t, f), Now, photos.Available);
    public async Task<RegistrationFormDto> GetPublicAsync(string slug)
    {
        var t = await db.Tournaments.SingleOrDefaultAsync(t => t.Slug == slug) ?? throw new KeyNotFoundException("Registration form not found.");
        return FormDto(t, await db.RegistrationForms.FindAsync(t.Id));
    }
    public async Task<RegistrationFormDto> GetSettingsAsync(Guid id, Guid user)
        => FormDto(await Tournament(id, user), await db.RegistrationForms.FindAsync(id));
    public async Task<RegistrationFormDto> UpdateSettingsAsync(Guid id, Guid user, RegistrationSettingsRequest r)
    {
        await Tournament(id, user);
        await using var tx = await Lock(id);
        var t = await db.Tournaments.AsNoTracking().SingleAsync(t => t.Id == id);
        if (t.Status != TournamentStatus.DRAFT) throw new InvalidOperationException("Registration settings can only change while the tournament is in draft.");
        var f = await db.RegistrationForms.FindAsync(id);
        if (f?.FinalizedAtUtc != null) throw new InvalidOperationException("Registration has been finalized.");
        if (r.Enabled && (r.OpensAtUtc == null || r.ClosesAtUtc == null)) throw new ArgumentException("Set both an opening time and a closing time.");
        if (r.OpensAtUtc.HasValue && r.ClosesAtUtc.HasValue && r.OpensAtUtc >= r.ClosesAtUtc) throw new ArgumentException("The closing time must be after the opening time.");
        if (f == null) { f = new RegistrationForm { TournamentId = id }; db.RegistrationForms.Add(f); }
        f.Enabled = r.Enabled; f.OpensAtUtc = r.OpensAtUtc?.ToUniversalTime(); f.ClosesAtUtc = r.ClosesAtUtc?.ToUniversalTime();
        f.ClosedManually = r.ClosedManually; f.Instructions = Clean(r.Instructions);
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return FormDto(t, f);
    }
    private static RegistrationReceipt Receipt(PlayerRegistration r) => new(r.Id, $"LH-{r.Id:N}", r.SubmittedAtUtc);
    public async Task<RegistrationReceipt> GetReceiptAsync(string slug, Guid submissionId)
    {
        var r = await db.PlayerRegistrations.AsNoTracking().SingleOrDefaultAsync(r => r.Id == submissionId && r.Tournament.Slug == slug)
            ?? throw new KeyNotFoundException("No confirmed submission with this reference.");
        return Receipt(r); // No name, contact details or review information on the public endpoint.
    }
    public async Task<RegistrationReceipt> SubmitAsync(string slug, RegistrationSubmissionRequest r)
    {
        if (r.SubmissionId == Guid.Empty || !r.Consent || !string.IsNullOrEmpty(r.Website)) throw new ArgumentException("Confirm consent and complete the registration form.");
        Validate(r.Name, r.Phone, r.Position, r.PreferredFoot);
        var t = await db.Tournaments.AsNoTracking().SingleOrDefaultAsync(t => t.Slug == slug) ?? throw new KeyNotFoundException("Registration form not found.");
        await using var tx = await Lock(t.Id);
        var existing = await db.PlayerRegistrations.AsNoTracking().SingleOrDefaultAsync(x => x.Id == r.SubmissionId);
        if (existing != null)
        {
            if (existing.TournamentId != t.Id) throw new InvalidOperationException("This reference belongs to another registration form.");
            return Receipt(existing); // Also works after the deadline or finalization when a response was lost.
        }
        t = await db.Tournaments.AsNoTracking().SingleAsync(x => x.Id == t.Id);
        if (Status(t, await db.RegistrationForms.FindAsync(t.Id)) != "OPEN") throw new InvalidOperationException("Registrations are not open. Your details have not been submitted.");
        if (await db.PlayerRegistrations.CountAsync(x => x.TournamentId == t.Id) >= 10000) throw new InvalidOperationException("The registration limit has been reached. Contact the organiser.");
        var entry = new PlayerRegistration {
            Id = r.SubmissionId, TournamentId = t.Id, Name = r.Name.Trim(), Phone = Phone(r.Phone), Email = Clean(r.Email)?.ToLowerInvariant(),
            Age = r.Age, Position = r.Position, PreferredFoot = Clean(r.PreferredFoot), JerseyNumber = r.JerseyNumber,
            PreviousTeam = Clean(r.PreviousTeam), ShortBio = Clean(r.ShortBio), SubmittedAtUtc = Now
        };
        if (r.Photo != null) entry.PhotoPath = await photos.UploadAsync(t.Id, r.SubmissionId, r.Photo);
        db.PlayerRegistrations.Add(entry);
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return Receipt(entry);
    }
    public async Task<List<RegistrationEntryDto>> ListAsync(Guid id, Guid user)
    {
        await Tournament(id, user);
        var entries = await db.PlayerRegistrations.AsNoTracking().Where(r => r.TournamentId == id).OrderByDescending(r => r.SubmittedAtUtc).ToListAsync();
        var names = await db.Players.Where(p => p.TournamentId == id).Select(p => new { p.Id, p.Name }).ToListAsync();
        var result = new List<RegistrationEntryDto>();
        foreach (var r in entries)
        {
            var duplicate = entries.Any(x => x.Id != r.Id && (x.Phone == r.Phone || x.Name.Equals(r.Name, StringComparison.OrdinalIgnoreCase))) ||
                names.Any(x => x.Id != r.PlayerId && x.Name.Equals(r.Name, StringComparison.OrdinalIgnoreCase));
            result.Add(new(r.Id, r.Name, r.Phone, r.Email, r.Age, r.Position, r.PreferredFoot, r.JerseyNumber,
                r.PreviousTeam, r.ShortBio, null,
                r.Status, r.ReviewReason, r.PlayerId, r.SubmittedAtUtc, r.ReviewedAtUtc, duplicate, r.PhotoPath != null));
        }
        return result;
    }
    public async Task<object> GetPhotoAsync(Guid id, Guid submissionId, Guid user)
    {
        await Tournament(id, user);
        var r = await db.PlayerRegistrations.AsNoTracking().SingleOrDefaultAsync(r => r.Id == submissionId && r.TournamentId == id)
            ?? throw new KeyNotFoundException("Registration not found.");
        return new { photoUrl = r.PhotoPath == null ? null : await photos.ReviewUrlAsync(r.PhotoPath) };
    }
    public async Task<RegistrationReceipt> ReviewAsync(Guid id, Guid submissionId, Guid user, RegistrationReviewRequest request)
    {
        await Tournament(id, user);
        await using var tx = await Lock(id);
        var t = await db.Tournaments.AsNoTracking().SingleAsync(t => t.Id == id);
        var f = await db.RegistrationForms.FindAsync(id);
        if (t.Status != TournamentStatus.DRAFT || f?.FinalizedAtUtc != null) throw new InvalidOperationException("Registration review is locked.");
        var r = await db.PlayerRegistrations.SingleOrDefaultAsync(r => r.Id == submissionId && r.TournamentId == id) ?? throw new KeyNotFoundException("Registration not found.");
        if (r.Status != "PENDING") throw new InvalidOperationException("This submission has already been reviewed. Refresh the queue.");
        Validate(request.Name, request.Phone, request.Position, request.PreferredFoot);
        if (request.Approve)
        {
            if (request.PlayerSetId == null || request.BasePrice == null) throw new ArgumentException("Assign a player set and base price before approving.");
            var phone = Phone(request.Phone); var name = request.Name.Trim().ToLower();
            var duplicate = await db.PlayerRegistrations.AnyAsync(x => x.TournamentId == id && x.Id != r.Id && (x.Phone == phone || x.Name.ToLower() == name)) ||
                await db.Players.AnyAsync(x => x.TournamentId == id && x.Name.ToLower() == name);
            if (duplicate && !request.DuplicateConfirmed) throw new InvalidOperationException("Possible duplicate. Verify it and confirm before approving.");
            var player = await players.CreatePlayerAsync(id, new CreatePlayerRequest(request.Name, request.PlayerSetId.Value,
                request.BasePrice.Value, null, request.Age, request.Position, request.PreferredFoot,
                request.JerseyNumber, request.PreviousTeam, request.ShortBio), user);
            if (r.PhotoPath != null)
            {
                var approvedPlayer = await db.Players.FindAsync(player.Id);
                approvedPlayer!.PhotoUrl = await photos.PublishAsync(r.PhotoPath);
            }
            r.PlayerId = player.Id;
        }
        else if (string.IsNullOrWhiteSpace(request.Reason)) throw new ArgumentException("Provide a reason for rejection.");
        r.Name = request.Name.Trim(); r.Phone = Phone(request.Phone); r.Email = Clean(request.Email)?.ToLowerInvariant();
        r.Age = request.Age; r.Position = request.Position; r.PreferredFoot = Clean(request.PreferredFoot);
        r.JerseyNumber = request.JerseyNumber; r.PreviousTeam = Clean(request.PreviousTeam); r.ShortBio = Clean(request.ShortBio);
        r.Status = request.Approve ? "APPROVED" : "REJECTED"; r.ReviewReason = Clean(request.Reason);
        r.ReviewedByUserId = user; r.ReviewedAtUtc = Now;
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return Receipt(r);
    }
    public async Task<RegistrationFormDto> FinalizeAsync(Guid id, Guid user)
    {
        await Tournament(id, user);
        await using var tx = await Lock(id);
        var t = await db.Tournaments.AsNoTracking().SingleAsync(t => t.Id == id);
        if (t.Status != TournamentStatus.DRAFT) throw new InvalidOperationException("Finalize registrations before making the tournament ready.");
        var f = await db.RegistrationForms.FindAsync(id) ?? throw new InvalidOperationException("Configure registration first.");
        if (await db.PlayerRegistrations.AnyAsync(r => r.TournamentId == id && r.Status == "PENDING")) throw new InvalidOperationException("Review every pending submission before finalizing.");
        f.ClosedManually = true; f.FinalizedAtUtc ??= Now;
        await db.SaveChangesAsync();
        if (tx != null) await tx.CommitAsync();
        return FormDto(t, f);
    }
}
