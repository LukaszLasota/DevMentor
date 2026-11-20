import { z } from 'zod';
import type { BookingStarted, BookingView } from '../services/bookings/booking.service';
import { BOOKING_NOT_FOUND_MESSAGE } from '../services/bookings/booking.service';
import { bookingStartSchema } from '../validators/bookings/booking-start.schema';
import type { ApiHandlerOptions, HandlerArgs, RouteParams } from './apiHandler';
import { requireSession } from './auth';
import { NotFoundError } from './errors';
import { parseJsonBody } from './parse';

// Booking routes as `apiHandler` handlers (spec 2026-11-20-booking-stripe-checkout, API Contracts);
// the app's route files only wire them. The mentee is always the session user; any signed-in user
// may book (D10: no mentor acceptance), except their own time (403 in the service).

/** Personal and payment state: never cached. */
export const BOOKING_RESPONSE: ApiHandlerOptions = { headers: { 'Cache-Control': 'no-store' } };

/** Route params of `/api/bookings/[id]` (a type, not an interface: it must fit `RouteParams`). */
export type BookingIdParams = { id: string };

/** `POST /api/bookings` `{ slotId, length }` → `{ bookingId, checkoutUrl }`; the browser goes to Stripe. */
export async function startBooking({ req, cradle }: HandlerArgs<RouteParams>): Promise<BookingStarted> {
  const user = await requireSession(req, cradle);
  const input = await parseJsonBody(req, bookingStartSchema);

  return cradle.bookingService.start({ id: user.id, email: user.email }, input);
}

/** `GET /api/bookings/[id]` → the caller's own booking; anyone else's, unknown or malformed → 404. */
export async function getOwnBooking({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<BookingView> {
  const user = await requireSession(req, cradle);

  if (!z.uuid().safeParse(params.id).success) {
    throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
  }

  return cradle.bookingService.getOwn(user.id, params.id);
}
