using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TournamentAuction.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLiveBidState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "CurrentBid",
                table: "AuctionLots",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "LeadingTeamId",
                table: "AuctionLots",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AuctionLots_LeadingTeamId",
                table: "AuctionLots",
                column: "LeadingTeamId");

            migrationBuilder.AddForeignKey(
                name: "FK_AuctionLots_Teams_LeadingTeamId",
                table: "AuctionLots",
                column: "LeadingTeamId",
                principalTable: "Teams",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AuctionLots_Teams_LeadingTeamId",
                table: "AuctionLots");

            migrationBuilder.DropIndex(
                name: "IX_AuctionLots_LeadingTeamId",
                table: "AuctionLots");

            migrationBuilder.DropColumn(
                name: "CurrentBid",
                table: "AuctionLots");

            migrationBuilder.DropColumn(
                name: "LeadingTeamId",
                table: "AuctionLots");
        }
    }
}
