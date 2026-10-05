using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAuctionEngineEntities : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuctionEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuctionSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuctionLotId = table.Column<Guid>(type: "uuid", nullable: true),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    EventData = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionEvents_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AuctionEvents_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AuctionLots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AuctionSessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayerId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlayerSetId = table.Column<Guid>(type: "uuid", nullable: false),
                    AttemptNumber = table.Column<int>(type: "integer", nullable: false),
                    DrawPosition = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    WinningTeamId = table.Column<Guid>(type: "uuid", nullable: true),
                    FinalPrice = table.Column<long>(type: "bigint", nullable: true),
                    RevealedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionLots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionLots_PlayerSets_PlayerSetId",
                        column: x => x.PlayerSetId,
                        principalTable: "PlayerSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AuctionLots_Players_PlayerId",
                        column: x => x.PlayerId,
                        principalTable: "Players",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AuctionLots_Teams_WinningTeamId",
                        column: x => x.WinningTeamId,
                        principalTable: "Teams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_AuctionLots_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "AuctionSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    CurrentSetId = table.Column<Guid>(type: "uuid", nullable: true),
                    CurrentLotId = table.Column<Guid>(type: "uuid", nullable: true),
                    IsUnsoldRound = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PausedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuctionSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AuctionSessions_AuctionLots_CurrentLotId",
                        column: x => x.CurrentLotId,
                        principalTable: "AuctionLots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_AuctionSessions_PlayerSets_CurrentSetId",
                        column: x => x.CurrentSetId,
                        principalTable: "PlayerSets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_AuctionSessions_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionEvents_AuctionLotId",
                table: "AuctionEvents",
                column: "AuctionLotId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionEvents_AuctionSessionId_CreatedAtUtc",
                table: "AuctionEvents",
                columns: new[] { "AuctionSessionId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionEvents_TournamentId_CreatedAtUtc",
                table: "AuctionEvents",
                columns: new[] { "TournamentId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionEvents_UserId",
                table: "AuctionEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_AuctionSessionId_PlayerId_AttemptNumber",
                table: "AuctionLots",
                columns: new[] { "AuctionSessionId", "PlayerId", "AttemptNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_AuctionSessionId_PlayerSetId_DrawPosition",
                table: "AuctionLots",
                columns: new[] { "AuctionSessionId", "PlayerSetId", "DrawPosition" });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_AuctionSessionId_Status",
                table: "AuctionLots",
                columns: new[] { "AuctionSessionId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_PlayerId",
                table: "AuctionLots",
                column: "PlayerId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_PlayerSetId",
                table: "AuctionLots",
                column: "PlayerSetId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_TournamentId",
                table: "AuctionLots",
                column: "TournamentId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_WinningTeamId",
                table: "AuctionLots",
                column: "WinningTeamId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSessions_CurrentLotId",
                table: "AuctionSessions",
                column: "CurrentLotId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSessions_CurrentSetId",
                table: "AuctionSessions",
                column: "CurrentSetId");

            migrationBuilder.CreateIndex(
                name: "IX_AuctionSessions_TournamentId_Status",
                table: "AuctionSessions",
                columns: new[] { "TournamentId", "Status" });

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionEvents_AuctionLots_AuctionLotId",
                table: "AuctionEvents",
                column: "AuctionLotId",
                principalTable: "AuctionLots",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionEvents_AuctionSessions_AuctionSessionId",
                table: "AuctionEvents",
                column: "AuctionSessionId",
                principalTable: "AuctionSessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionLots_AuctionSessions_AuctionSessionId",
                table: "AuctionLots",
                column: "AuctionSessionId",
                principalTable: "AuctionSessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AuctionSessions_AuctionLots_CurrentLotId",
                table: "AuctionSessions");

            migrationBuilder.DropTable(
                name: "AuctionEvents");

            migrationBuilder.DropTable(
                name: "AuctionLots");

            migrationBuilder.DropTable(
                name: "AuctionSessions");
        }
    }
}
