// Money helpers. The platform currency is PLN (two decimals, grosze); amounts are held as
// integer minor units ("cents") and converted from/to major-unit strings without floats.

/** Integer minor units (grosze for PLN). */
export type Cents = number & { readonly __brand: 'Cents' };

const MAJOR_AMOUNT = /^(0|[1-9]\d*)(\.\d{1,2})?$/;

/**
 * Parses a schema-shaped major-unit string ("20", "20.5", "20.00") into cents using string and
 * BigInt arithmetic only — never floats, never rounding. A value above `Number.MAX_SAFE_INTEGER`
 * cannot be held exactly, so it returns `Number.POSITIVE_INFINITY`, which is above every bound.
 */
export function parseMajorAmount(value: string): Cents {
  if (!MAJOR_AMOUNT.test(value)) throw new Error(`Not a major-unit amount: ${value}`);
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole + fraction.padEnd(2, '0'));
  return (cents > BigInt(Number.MAX_SAFE_INTEGER) ? Number.POSITIVE_INFINITY : Number(cents)) as Cents;
}

/** Inclusive on both ends. */
export function withinBounds(cents: Cents, bounds: { minCents: number; maxCents: number }): boolean {
  return cents >= bounds.minCents && cents <= bounds.maxCents;
}

/** Display only (floating-point division); never use the result for arithmetic. */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Exact "150.00" string from integer cents (string math), e.g. to prefill a form. */
export function toMajorString(cents: number): string {
  const digits = String(cents).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
