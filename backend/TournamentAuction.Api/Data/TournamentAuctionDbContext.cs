using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Domain;

namespace TournamentAuction.Api.Data;

public class TournamentAuctionDbContext : DbContext
{
    public TournamentAuctionDbContext(DbContextOptions<TournamentAuctionDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Tournament> Tournaments => Set<Tournament>();
    public DbSet<TournamentMember> TournamentMembers => Set<TournamentMember>();
    public DbSet<TournamentSettings> TournamentSettings => Set<TournamentSettings>();
    public DbSet<BasePriceTier> BasePriceTiers => Set<BasePriceTier>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<PlayerSet> PlayerSets => Set<PlayerSet>();
    public DbSet<Player> Players => Set<Player>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Email).IsRequired().HasMaxLength(256);
            entity.Property(e => e.FullName).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PasswordHash).IsRequired();
            entity.HasIndex(e => e.Email).IsUnique();
        });

        // Tournament
        modelBuilder.Entity<Tournament>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Slug).IsRequired().HasMaxLength(200);
            entity.Property(e => e.Season).IsRequired().HasMaxLength(50);
            entity.Property(e => e.Status).HasConversion<string>().HasMaxLength(20);
            entity.Property(e => e.TimeZone).HasMaxLength(50);
            entity.HasIndex(e => e.Slug).IsUnique();

            entity.HasOne(e => e.Owner)
                .WithMany()
                .HasForeignKey(e => e.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Settings)
                .WithOne(s => s.Tournament)
                .HasForeignKey<TournamentSettings>(s => s.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // TournamentSettings
        modelBuilder.Entity<TournamentSettings>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.CurrencyCode).IsRequired().HasMaxLength(10);
            entity.Property(e => e.CurrencySymbol).IsRequired().HasMaxLength(10);
            entity.HasIndex(e => e.TournamentId).IsUnique();
        });

        // BasePriceTier
        modelBuilder.Entity<BasePriceTier>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Label).IsRequired().HasMaxLength(50);
            entity.HasIndex(e => new { e.TournamentId, e.Amount }).IsUnique();

            entity.HasOne(e => e.Tournament)
                .WithMany(t => t.BasePriceTiers)
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Team
        modelBuilder.Entity<Team>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(150);
            entity.Property(e => e.ShortName).IsRequired().HasMaxLength(10);
            entity.Property(e => e.PrimaryColor).IsRequired().HasMaxLength(20);
            entity.Property(e => e.SecondaryColor).HasMaxLength(20);
            entity.Property(e => e.OwnerName).HasMaxLength(150);

            entity.HasIndex(e => new { e.TournamentId, e.Name }).IsUnique();
            entity.HasIndex(e => new { e.TournamentId, e.ShortName }).IsUnique();

            entity.HasOne(e => e.Tournament)
                .WithMany(t => t.Teams)
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // TournamentMember
        modelBuilder.Entity<TournamentMember>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(20);

            entity.HasIndex(e => new { e.TournamentId, e.UserId }).IsUnique();

            entity.HasOne(e => e.Tournament)
                .WithMany(t => t.Members)
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.User)
                .WithMany(u => u.Memberships)
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // PlayerSet
        modelBuilder.Entity<PlayerSet>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(100);
            entity.Property(e => e.Description).HasMaxLength(500);

            entity.HasIndex(e => new { e.TournamentId, e.Name }).IsUnique();

            entity.HasOne(e => e.Tournament)
                .WithMany(t => t.PlayerSets)
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Player
        modelBuilder.Entity<Player>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).IsRequired().HasMaxLength(150);
            entity.Property(e => e.PhotoUrl).HasMaxLength(1000);
            entity.Property(e => e.Position).HasMaxLength(50);
            entity.Property(e => e.PreferredFoot).HasMaxLength(20);
            entity.Property(e => e.PreviousTeam).HasMaxLength(150);
            entity.Property(e => e.ShortBio).HasMaxLength(1000);
            entity.Property(e => e.Status).IsRequired().HasMaxLength(30);

            entity.HasIndex(e => new { e.TournamentId, e.PlayerSetId });
            entity.HasIndex(e => new { e.TournamentId, e.Status });
            entity.HasIndex(e => new { e.TournamentId, e.Name });

            entity.HasOne(e => e.Tournament)
                .WithMany(t => t.Players)
                .HasForeignKey(e => e.TournamentId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.PlayerSet)
                .WithMany(s => s.Players)
                .HasForeignKey(e => e.PlayerSetId)
                .OnDelete(DeleteBehavior.Restrict);
        });
    }
}
