/** `10000` → `"10,000"`; decimals kept as given. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 20 });
}
