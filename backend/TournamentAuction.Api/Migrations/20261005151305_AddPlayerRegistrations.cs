using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerRegistrations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlayerRegistrations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Email = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    Age = table.Column<int>(type: "integer", nullable: true),
                    Position = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PreferredFoot = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    JerseyNumber = table.Column<int>(type: "integer", nullable: true),
                    PreviousTeam = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ShortBio = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    PhotoPath = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ReviewReason = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    PlayerId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReviewedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewedByUserId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlayerRegistrations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlayerRegistrations_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PlayerRegistrations_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RegistrationForms",
                columns: table => new
                {
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    OpensAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosesAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClosedManually = table.Column<bool>(type: "boolean", nullable: false),
                    FinalizedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Instructions = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RegistrationForms", x => x.TournamentId);
                    table.ForeignKey(
                        name: "FK_RegistrationForms_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PlayerRegistrations_PlayerId",
                table: "PlayerRegistrations",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_PlayerRegistrations_TournamentId_Phone",
                table: "PlayerRegistrations",
                columns: new[] { "TournamentId", "Phone" });

            migrationBuilder.CreateIndex(
                name: "IX_PlayerRegistrations_TournamentId_Status",
                table: "PlayerRegistrations",
                columns: new[] { "TournamentId", "Status" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PlayerRegistrations");

            migrationBuilder.DropTable(
                name: "RegistrationForms");
        }
    }
}
