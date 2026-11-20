import { z } from 'zod';

// `POST /api/availability/slots` and the /mentor/slots form (spec 2026-10-21-availability-slots).
// Shape only: an ISO-8601 UTC instant ending in `Z`, on a whole minute. Whether it is in the past or
// too far ahead is the service's decision (it owns the clock).

export const STARTS_AT_MESSAGE = 'Pick a start time on a whole minute.';

/** `2026-06-22T16:00Z`, `…T16:00:00Z` or `…T16:00:00.000Z`; any other offset, seconds or milliseconds are refused. */
const WHOLE_MINUTE_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:00(\.0{1,3})?)?Z$/;

/** One check, so one message (lesson 2026-11-14): the shape and a real calendar instant. */
export function isWholeMinuteUtc(value: string): boolean {
  if (!WHOLE_MINUTE_UTC.test(value)) {
    return false;
  }

  const instant = new Date(value);

  // `Date` rolls 2026-02-30 over to March: a real date round-trips to the same day and time.
  return !Number.isNaN(instant.getTime()) && instant.toISOString().slice(0, 16) === value.slice(0, 16);
}

export const slotCreateSchema = z.object({
  startsAt: z.string().trim().refine(isWholeMinuteUtc, STARTS_AT_MESSAGE),
});

export type SlotCreateInput = z.output<typeof slotCreateSchema>;
