import { z } from 'zod';
import { SESSION_LENGTHS } from '../../domain/session-lengths';

// `POST /api/bookings` (spec 2026-11-20-booking-stripe-checkout). Shape only: which slot and which
// length. The price, the lead time, occupancy and the mentor's readiness are the service's decision;
// nothing the client sends sets an amount.

export const SLOT_ID_MESSAGE = 'Pick an open time.';
export const LENGTH_MESSAGE = 'Pick 25 or 50 minutes.';

export const bookingStartSchema = z.object({
  slotId: z.uuid(SLOT_ID_MESSAGE),
  length: z.enum(SESSION_LENGTHS, LENGTH_MESSAGE),
});

export type BookingStartInput = z.output<typeof bookingStartSchema>;
