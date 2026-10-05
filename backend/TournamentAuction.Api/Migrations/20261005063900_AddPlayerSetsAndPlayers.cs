using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerSetsAndPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PlayerSets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PlayerSets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlayerSets_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Players",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayerSetId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhotoUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Age = table.Column<int>(type: "integer", nullable: true),
                    Position = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PreferredFoot = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BasePrice = table.Column<long>(type: "bigint", nullable: false),
                    JerseyNumber = table.Column<int>(type: "integer", nullable: true),
                    PreviousTeam = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ShortBio = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Status = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Players", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Players_PlayerSets_PlayerSetId",
                        column: x => x.PlayerSetId,
                        principalTable: "PlayerSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Players_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Players_PlayerSetId",
                table: "Players",
                column: "PlayerSetId");

            migrationBuilder.CreateIndex(
                name: "IX_Players_TournamentId_Name",
                table: "Players",
                columns: new[] { "TournamentId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_Players_TournamentId_PlayerSetId",
                table: "Players",
                columns: new[] { "TournamentId", "PlayerSetId" });

            migrationBuilder.CreateIndex(
                name: "IX_Players_TournamentId_Status",
                table: "Players",
                columns: new[] { "TournamentId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PlayerSets_TournamentId_Name",
                table: "PlayerSets",
                columns: new[] { "TournamentId", "Name" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Players");

            migrationBuilder.DropTable(
                name: "PlayerSets");
        }
    }
}
