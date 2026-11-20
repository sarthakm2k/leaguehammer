using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTeamCaptainAndIconAssignments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AssignedRole",
                table: "Players",
                type: "character varying(7)",
                maxLength: 7,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "AssignedTeamId",
                table: "Players",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players",
                columns: new[] { "AssignedTeamId", "AssignedRole" },
                unique: true,
                filter: "\"AssignedTeamId\" IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Players_TeamAssignment",
                table: "Players",
                sql: "(\"AssignedTeamId\" IS NULL AND \"AssignedRole\" IS NULL AND \"Status\" <> 'ASSIGNED') OR (\"AssignedTeamId\" IS NOT NULL AND \"AssignedRole\" IN ('CAPTAIN', 'ICON') AND \"AssignedRole\" IS NOT NULL AND \"Status\" = 'ASSIGNED')");

            migrationBuilder.AddForeignKey(
                name: "FK_Players_Teams_AssignedTeamId",
                table: "Players",
                column: "AssignedTeamId",
                principalTable: "Teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Players_Teams_AssignedTeamId",
                table: "Players");

            migrationBuilder.DropIndex(
                name: "IX_Players_AssignedTeamId_AssignedRole",
                table: "Players");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Players_TeamAssignment",
                table: "Players");

            migrationBuilder.Sql("UPDATE \"Players\" SET \"Status\" = 'AVAILABLE' WHERE \"AssignedTeamId\" IS NOT NULL");

            migrationBuilder.DropColumn(
                name: "AssignedRole",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "AssignedTeamId",
                table: "Players");
        }
    }
}
