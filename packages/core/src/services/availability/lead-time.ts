// Fixed product rules of availability (spec 2026-10-21-availability-slots; R09/D09), not env:
// pure, so #29 reuses `meetsLeadTime` for its booking-time recheck.

/** A slot is bookable only when it starts at least this long after "now" (R09). */
export const BOOKING_LEAD_TIME_MINUTES = 120;
/** Active (non-removed) future slots one mentor may hold. */
export const MAX_ACTIVE_FUTURE_SLOTS = 200;
/** How far ahead a slot may start. */
export const MAX_HORIZON_DAYS = 365;
/** Rows of the "Show past" list. */
export const PAST_LIST_LIMIT = 50;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** `startsAt >= now + 2 h` — inclusive: a slot exactly two hours away is still bookable. */
export function meetsLeadTime(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() >= now.getTime() + BOOKING_LEAD_TIME_MINUTES * MINUTE_MS;
}

/** The latest instant a slot may start at, seen from `now`. */
export function horizonFrom(now: Date): Date {
  return new Date(now.getTime() + MAX_HORIZON_DAYS * DAY_MS);
}
