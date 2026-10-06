using Microsoft.EntityFrameworkCore;
using TournamentAuction.Api.Data;
using TournamentAuction.Api.Domain;
using TournamentAuction.Api.Features.Players;

namespace TournamentAuction.Tests;

public class PlayerCardRatingsTests
{
    [Fact]
    public void Blank_And_Partial_Ratings_Calculate_Without_Inventing_Values()
    {
        Assert.Null(CardRatings.Overall(new(), false));
        Assert.Equal(81, CardRatings.Overall(new(Pace: 80, Shooting: 81), false));
        Assert.Equal(99, CardRatings.Overall(new(Pace: 99, Shooting: 99), false));
        Assert.Equal(90, CardRatings.Overall(new(Pace: 10, Diving: 89, Reflexes: 90), true));
        Assert.Null(CardRatings.Overall(new(Pace: 99), true));
    }

    [Theory]
    [InlineData(0)] [InlineData(-1)] [InlineData(100)] [InlineData(1000)]
    public void Both_Rating_Profiles_Reject_Out_Of_Range_Attributes(int value)
    {
        Assert.Throws<ArgumentException>(() => CardRatings.Apply(new Player(), "ST", new(Pace: value)));
        Assert.Throws<ArgumentException>(() => CardRatings.Apply(new Player(), "GK", new(Reflexes: value)));
    }

    [Fact]
    public async Task Ratings_RoundTrip_Through_Create_List_Update_And_Clear()
    {
        await using var db = new TournamentAuctionDbContext(new DbContextOptionsBuilder<TournamentAuctionDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var owner = new User { Email="owner@cards.test", FullName="Owner", PasswordHash="test" };
        var tournament = new Tournament { Name="Card Cup", Slug="card-cup", OwnerUserId=owner.Id, Owner=owner };
        var set = new PlayerSet { TournamentId=tournament.Id, Tournament=tournament, Name="First set" };
        db.AddRange(owner,tournament,set); await db.SaveChangesAsync();
        var service = new PlayerService(db);
        var player = await service.CreatePlayerAsync(tournament.Id,new("Card Player",set.Id,500,null,22,"Forward","Right",null,null,null,"ST",new(Pace:99,Shooting:80)),owner.Id);
        Assert.Equal("ST",player.CardPosition); Assert.Equal(90,player.Ratings!.Overall);
        Assert.Null(player.Ratings.Attributes.Passing);
        var listed = (await service.GetPlayersAsync(tournament.Id,new(),owner.Id)).Items.Single();
        Assert.Equal(player.Ratings,listed.Ratings);
        var updated = await service.UpdatePlayerAsync(tournament.Id,player.Id,new("Card Player",set.Id,500,null,22,"Goalkeeper","Right",null,null,null,"GK",new(Diving:99,Reflexes:97)),owner.Id);
        Assert.True(updated.Ratings!.IsGoalkeeper); Assert.Equal(98,updated.Ratings.Overall); Assert.Null(updated.Ratings.Attributes.Pace);
        var cleared = await service.UpdatePlayerAsync(tournament.Id,player.Id,new("Card Player",set.Id,500,null,22,"Forward","Right",null,null,null,null,new()),owner.Id);
        Assert.Null(cleared.CardPosition); Assert.Null(cleared.Ratings!.Overall);
        await Assert.ThrowsAsync<ArgumentException>(() => service.CreatePlayerAsync(tournament.Id,new("Invalid Player",set.Id,500,null,22,"Forward",null,null,null,null,"INVALID"),owner.Id));
        Assert.Single(await db.Players.ToListAsync());
    }
}
