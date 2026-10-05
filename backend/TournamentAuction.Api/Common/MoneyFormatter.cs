using System.Globalization;

namespace TournamentAuction.Api.Common;

/// <summary>
/// Centralized money helper for integer representation (BIGINT / long).
/// Amounts are stored as integers (e.g. ₹500 is 500, or smallest currency unit).
/// Per Section 9: Never use floating-point numbers for currency.
/// </summary>
public static class MoneyFormatter
{
    private static readonly CultureInfo IndianCulture = new CultureInfo("en-IN");

    /// <summary>
    /// Formats an amount using Indian currency style (e.g. ₹1,00,000).
    /// </summary>
    public static string FormatInr(long amount)
    {
        return $"₹{amount.ToString("N0", IndianCulture)}";
    }

    /// <summary>
    /// Formats an amount by currency code.
    /// </summary>
    public static string FormatCurrency(long amount, string currencyCode = "INR")
    {
        return currencyCode.ToUpperInvariant() switch
        {
            "INR" => FormatInr(amount),
            "USD" => $"${amount.ToString("N0", CultureInfo.InvariantCulture)}",
            "EUR" => $"€{amount.ToString("N0", CultureInfo.InvariantCulture)}",
            "GBP" => $"£{amount.ToString("N0", CultureInfo.InvariantCulture)}",
            _ => $"{currencyCode} {amount.ToString("N0", CultureInfo.InvariantCulture)}"
        };
    }
}
