import type { SessionLength } from '../../domain/session-lengths';
import { SESSION_LENGTHS } from '../../domain/session-lengths';

// Occupancy rules (spec 2026-11-20-booking-stripe-checkout, Q9): a booking occupies
// [startsAt, startsAt + length); a length is offered on a slot only when that interval overlaps no
// active booking of the same mentor. Pure, so SlotService and BookingService share one rule.

const MINUTE_MS = 60_000;

/** The time an active booking occupies. */
export interface BusyInterval {
  startsAt: Date;
  endsAt: Date;
}

/** `startsAt + length` minutes. */
export function endOf(startsAt: Date, length: SessionLength): Date {
  return new Date(startsAt.getTime() + Number(length) * MINUTE_MS);
}

/** Half-open intervals: back-to-back sessions (one ends at 14:25, the next starts at 14:25) do not overlap. */
export function overlaps(a: BusyInterval, b: BusyInterval): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();
}

/** The lengths whose interval from `startsAt` is free of every busy interval, in 25, 50 order. */
export function freeLengths(startsAt: Date, busy: readonly BusyInterval[]): SessionLength[] {
  return SESSION_LENGTHS.filter((length) => {
    const wanted = { startsAt, endsAt: endOf(startsAt, length) };

    return busy.every((interval) => !overlaps(wanted, interval));
  });
}
