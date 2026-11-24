using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AllowMultipleTeamIconPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players");

            migrationBuilder.CreateIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players",
                columns: new[] { "AssignedTeamId", "AssignedRole" });

            migrationBuilder.CreateIndex(
                name: "IX_Players_AssignedTeamId_Captain",
                table: "Players",
                column: "AssignedTeamId",
                unique: true,
                filter: "\"AssignedTeamId\" IS NOT NULL AND \"AssignedRole\" = 'CAPTAIN'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$ BEGIN
                    IF EXISTS (SELECT 1 FROM "Players" WHERE "AssignedRole" = 'ICON' AND "AssignedTeamId" IS NOT NULL
                               GROUP BY "AssignedTeamId" HAVING COUNT(*) > 1) THEN
                        RAISE EXCEPTION 'Remove extra icon assignments before reverting to one icon per team.';
                    END IF;
                END; $$;
                """);

            migrationBuilder.DropIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players");

            migrationBuilder.DropIndex(
                name: "IX_Players_AssignedTeamId_Captain",
                table: "Players");

            migrationBuilder.CreateIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players",
                columns: new[] { "AssignedTeamId", "AssignedRole" },
                unique: true,
                filter: "\"AssignedTeamId\" IS NOT NULL");
        }
    }
}
