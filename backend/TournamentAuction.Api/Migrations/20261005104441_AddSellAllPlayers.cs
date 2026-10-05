using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSellAllPlayers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "SellAllPlayers",
                table: "TournamentSettings",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SellAllPlayers",
                table: "TournamentSettings");
        }
    }
}
