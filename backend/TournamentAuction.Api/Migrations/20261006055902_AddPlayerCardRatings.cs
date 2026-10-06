using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPlayerCardRatings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CardPosition",
                table: "Players",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Defending",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Diving",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Dribbling",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Handling",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Kicking",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Pace",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Passing",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Physical",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Positioning",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Reflexes",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Shooting",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Speed",
                table: "Players",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CardPosition",
                table: "PlayerRegistrations",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Players_CardRatings",
                table: "Players",
                sql: "(\"Pace\" IS NULL OR \"Pace\" BETWEEN 1 AND 99) AND (\"Shooting\" IS NULL OR \"Shooting\" BETWEEN 1 AND 99) AND (\"Passing\" IS NULL OR \"Passing\" BETWEEN 1 AND 99) AND (\"Dribbling\" IS NULL OR \"Dribbling\" BETWEEN 1 AND 99) AND (\"Defending\" IS NULL OR \"Defending\" BETWEEN 1 AND 99) AND (\"Physical\" IS NULL OR \"Physical\" BETWEEN 1 AND 99) AND (\"Diving\" IS NULL OR \"Diving\" BETWEEN 1 AND 99) AND (\"Handling\" IS NULL OR \"Handling\" BETWEEN 1 AND 99) AND (\"Kicking\" IS NULL OR \"Kicking\" BETWEEN 1 AND 99) AND (\"Reflexes\" IS NULL OR \"Reflexes\" BETWEEN 1 AND 99) AND (\"Speed\" IS NULL OR \"Speed\" BETWEEN 1 AND 99) AND (\"Positioning\" IS NULL OR \"Positioning\" BETWEEN 1 AND 99)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Players_CardRatings",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "CardPosition",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Defending",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Diving",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Dribbling",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Handling",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Kicking",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Pace",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Passing",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Physical",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Positioning",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Reflexes",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Shooting",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "Speed",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "CardPosition",
                table: "PlayerRegistrations");
        }
    }
}
