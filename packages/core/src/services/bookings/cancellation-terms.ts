/** R10: a cancellation is free only while the session is more than 24 hours away. */
export const FREE_CANCELLATION_MS = 24 * 60 * 60_000;

/** What cancelling at `now` means for a booking that starts at `startsAt`. */
export interface CancellationTerms {
  /** Full refund (strictly more than 24 hours ahead); otherwise the fee is forfeited. */
  refundDue: boolean;
  /** The last instant a cancellation is free (exclusive). */
  freeUntil: Date;
}

/** Decided once, on the server, at the moment of cancelling (spec 2026-11-20-booking-cancellation Q3). */
export function cancellationTerms(startsAt: Date, now: Date): CancellationTerms {
  const freeUntil = new Date(startsAt.getTime() - FREE_CANCELLATION_MS);

  return { refundDue: now.getTime() < freeUntil.getTime(), freeUntil };
}
