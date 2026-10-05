using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Text;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Features.Auction;
using TournamentAuction.Api.Features.Auth;
using TournamentAuction.Api.Features.BasePriceTiers;
using TournamentAuction.Api.Features.PlayerSets;
using TournamentAuction.Api.Features.Players;
using TournamentAuction.Api.Features.Preflight;
using TournamentAuction.Api.Features.Settings;
using TournamentAuction.Api.Features.Teams;
using TournamentAuction.Api.Features.Tournaments;
using TournamentAuction.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Database configuration
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");

builder.Services.AddDbContext<TournamentAuctionDbContext>(options =>
    options.UseNpgsql(connectionString));

// Application Services
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ITournamentService, TournamentService>();
builder.Services.AddScoped<ITournamentSettingsService, TournamentSettingsService>();
builder.Services.AddScoped<ITeamService, TeamService>();
builder.Services.AddScoped<IBasePriceTierService, BasePriceTierService>();
builder.Services.AddScoped<IPlayerSetService, PlayerSetService>();
builder.Services.AddScoped<IPlayerService, PlayerService>();
builder.Services.AddScoped<ITournamentPreflightService, TournamentPreflightService>();
builder.Services.AddScoped<IAuctionEngineService, AuctionEngineService>();

// SignalR
builder.Services.AddSignalR();

// Health Checks
builder.Services.AddHealthChecks();

// Controllers / Endpoints
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

// Swagger
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Local Football Tournament Auction API",
        Version = "v1",
        Description = "API for conducting local football player auctions."
    });

    var securityScheme = new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme.",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT"
    };

    c.AddSecurityDefinition("Bearer", securityScheme);
    c.AddSecurityRequirement(doc => new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecuritySchemeReference("Bearer"),
            new List<string>()
        }
    });
});

// Authentication / JWT
var jwtSecret = builder.Configuration["Jwt:Secret"] ?? "SuperSecretDevelopmentKeyMustBeAtLeast32BytesLong!";
var key = Encoding.UTF8.GetBytes(jwtSecret);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = false,
        ValidateAudience = false,
        ClockSkew = TimeSpan.Zero
    };

    // Support JWT over SignalR query string
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hubs/auction"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

builder.Services.AddAuthorization();

// CORS
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://localhost:5174", "http://localhost:3000" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "Tournament Auction API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseCors("CorsPolicy");
app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    try { await next(); }
    catch (DbUpdateConcurrencyException)
    {
        context.Response.StatusCode = StatusCodes.Status409Conflict;
        await context.Response.WriteAsJsonAsync(new { detail = "The auction changed in another window. Refresh the state and try again." });
    }
});

// Map Hubs
app.MapHub<AuctionHub>("/hubs/auction");

// Health check endpoint
app.MapGet("/health", async (TournamentAuctionDbContext db) =>
{
    var canConnect = false;
    string? dbError = null;

    try
    {
        canConnect = await db.Database.CanConnectAsync();
    }
    catch (Exception ex)
    {
        dbError = ex.Message;
    }

    var status = canConnect ? "Healthy" : "Degraded";
    var result = new
    {
        status,
        timestamp = DateTime.UtcNow,
        database = new
        {
            canConnect,
            provider = "PostgreSQL",
            error = dbError
        },
        version = "1.0.0"
    };

    return canConnect ? Results.Ok(result) : Results.Json(result, statusCode: 503);
})
.WithName("HealthCheck")
.WithTags("System");

// Map Controllers
app.MapControllers();

// Automatically apply EF Core migrations in development
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TournamentAuctionDbContext>();
    await db.Database.MigrateAsync();
}

app.Run();
