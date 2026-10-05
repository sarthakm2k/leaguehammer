using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace TournamentAuction.Api.Features.Registrations;

public interface IRegistrationPhotoStorage
{
    bool Available { get; }
    Task<string> UploadAsync(Guid tournamentId, Guid submissionId, IFormFile photo);
    Task<string> ReviewUrlAsync(string path);
    Task<string> PublishAsync(string path);
}

// Keys never reach the browser. Pending photos live in a private bucket; only approved photos are public.
public class RegistrationPhotoStorage(HttpClient http, IConfiguration config) : IRegistrationPhotoStorage
{
    private string Url => (config["Supabase:Url"] ?? "").TrimEnd('/');
    private string Key => config["Supabase:ServiceRoleKey"] ?? "";
    private string PrivateBucket => config["Supabase:RegistrationBucket"] ?? "registration-photos";
    private string PublicBucket => config["Supabase:PlayerBucket"] ?? "player-photos";
    public bool Available => Uri.TryCreate(Url, UriKind.Absolute, out var uri) && uri.Scheme == "https" && Key.Length > 0;
    private async Task<HttpResponseMessage> Send(HttpMethod method, string path, HttpContent? content = null, bool upsert = false)
    {
        if (!Available) throw new InvalidOperationException("Photo storage is not configured. Submit without a photo or contact the organiser.");
        using var request = new HttpRequestMessage(method, $"{Url}/storage/v1/{path}") { Content = content };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", Key);
        request.Headers.Add("apikey", Key);
        if (upsert) request.Headers.Add("x-upsert", "true");
        var response = await http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            response.Dispose();
            throw new HttpRequestException("Photo storage is temporarily unavailable. Your registration has not been confirmed; please retry.");
        }
        return response;
    }

    public static string ValidatePhoto(byte[] bytes, string contentType)
    {
        if (bytes.Length == 0 || bytes.Length > 3 * 1024 * 1024)
            throw new ArgumentException("Choose a JPEG, PNG or WebP photo up to 3 MB.");
        if (contentType == "image/jpeg" && bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "jpg";
        if (contentType == "image/png" && bytes.Length >= 8 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10})) return "png";
        if (contentType == "image/webp" && bytes.Length >= 12 && System.Text.Encoding.ASCII.GetString(bytes,0,4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes,8,4) == "WEBP") return "webp";
        throw new ArgumentException("The photo must be a JPEG, PNG or WebP image.");
    }
    public async Task<string> UploadAsync(Guid tournamentId, Guid submissionId, IFormFile photo)
    {
        if (photo.Length > 3 * 1024 * 1024) throw new ArgumentException("Photos must be no larger than 3 MB.");
        using var buffer = new MemoryStream();
        await photo.CopyToAsync(buffer);
        var bytes = buffer.ToArray();
        var extension = ValidatePhoto(bytes, photo.ContentType);
        var path = $"{tournamentId}/{submissionId}.{extension}";
        using var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(photo.ContentType);
        using var response = await Send(HttpMethod.Post, $"object/{PrivateBucket}/{path}", content, true);
        return path;
    }
    public async Task<string> ReviewUrlAsync(string path)
    {
        using var response = await Send(HttpMethod.Post, $"object/sign/{PrivateBucket}/{path}", JsonContent.Create(new { expiresIn = 3600 }));
        using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
        return $"{Url}/storage/v1{body.RootElement.GetProperty("signedURL").GetString()}";
    }
    public async Task<string> PublishAsync(string path)
    {
        using var download = await Send(HttpMethod.Get, $"object/authenticated/{PrivateBucket}/{path}");
        using var content = new ByteArrayContent(await download.Content.ReadAsByteArrayAsync());
        content.Headers.ContentType = download.Content.Headers.ContentType;
        using var uploaded = await Send(HttpMethod.Post, $"object/{PublicBucket}/{path}", content, true);
        return $"{Url}/storage/v1/object/public/{PublicBucket}/{path}";
    }
}
