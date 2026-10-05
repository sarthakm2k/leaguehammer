using TournamentAuction.Api.Common;
using Xunit;

namespace TournamentAuction.Tests;

public class MoneyFormatterTests
{
    [Theory]
    [InlineData(500, "₹500")]
    [InlineData(1500, "₹1,500")]
    [InlineData(12500, "₹12,500")]
    [InlineData(100000, "₹1,00,000")]
    [InlineData(10000000, "₹1,00,00,000")]
    public void FormatInr_ShouldFormatAccordingToSpec(long amount, string expected)
    {
        var result = MoneyFormatter.FormatInr(amount);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void FormatCurrency_WithUsd_ShouldFormatProperly()
    {
        var result = MoneyFormatter.FormatCurrency(50000, "USD");
        Assert.Equal("$50,000", result);
    }
}
