/**
 * Money formatting helpers according to Section 9:
 * Formats numbers in INR (e.g. ₹500, ₹1,500, ₹12,500, ₹1,00,000)
 */
export function formatInr(amount: number | bigint): string {
  const formatter = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  });
  return `₹${formatter.format(amount)}`;
}

export function formatCurrency(amount: number | bigint, currencyCode = 'INR'): string {
  if (currencyCode.toUpperCase() === 'INR') {
    return formatInr(amount);
  }
  const formatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  });
  return `${currencyCode} ${formatter.format(amount)}`;
}
