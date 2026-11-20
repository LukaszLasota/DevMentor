// Bookable session lengths in minutes (R02). Client-safe: imports nothing.
export const SESSION_LENGTHS = ['25', '50'] as const;

export type SessionLength = (typeof SESSION_LENGTHS)[number];

/** The mentor price field that holds the price for a session length. */
export function priceField(length: SessionLength): 'price25' | 'price50' {
  return length === '25' ? 'price25' : 'price50';
}
