using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddFanChoiceVoting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FanChoicePolls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TournamentId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Enabled = table.Column<bool>(type: "boolean", nullable: false),
                    IsOpen = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FanChoicePolls", x => x.Id);
                    table.CheckConstraint("CK_FanChoicePolls_OpenEnabled", "NOT \"IsOpen\" OR \"Enabled\"");
                    table.ForeignKey(
                        name: "FK_FanChoicePolls_Tournaments_TournamentId",
                        column: x => x.TournamentId,
                        principalTable: "Tournaments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FanChoiceOptions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PollId = table.Column<Guid>(type: "uuid", nullable: false),
                    CandidateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhotoUrl = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Subtitle = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Price = table.Column<long>(type: "bigint", nullable: true),
                    RosterJson = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FanChoiceOptions", x => x.Id);
                    table.UniqueConstraint("AK_FanChoiceOptions_PollId_Id", x => new { x.PollId, x.Id });
                    table.ForeignKey(
                        name: "FK_FanChoiceOptions_FanChoicePolls_PollId",
                        column: x => x.PollId,
                        principalTable: "FanChoicePolls",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FanChoiceVotes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PollId = table.Column<Guid>(type: "uuid", nullable: false),
                    OptionId = table.Column<Guid>(type: "uuid", nullable: false),
                    VoterHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FanChoiceVotes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FanChoiceVotes_FanChoiceOptions_PollId_OptionId",
                        columns: x => new { x.PollId, x.OptionId },
                        principalTable: "FanChoiceOptions",
                        principalColumns: new[] { "PollId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_FanChoiceOptions_PollId_CandidateId",
                table: "FanChoiceOptions",
                columns: new[] { "PollId", "CandidateId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FanChoicePolls_TournamentId_Category",
                table: "FanChoicePolls",
                columns: new[] { "TournamentId", "Category" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FanChoiceVotes_PollId_OptionId",
                table: "FanChoiceVotes",
                columns: new[] { "PollId", "OptionId" });

            migrationBuilder.CreateIndex(
                name: "IX_FanChoiceVotes_PollId_VoterHash",
                table: "FanChoiceVotes",
                columns: new[] { "PollId", "VoterHash" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FanChoiceVotes");

            migrationBuilder.DropTable(
                name: "FanChoiceOptions");

            migrationBuilder.DropTable(
                name: "FanChoicePolls");
        }
    }
}
