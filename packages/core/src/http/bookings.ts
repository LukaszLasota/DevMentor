import { z } from 'zod';
import type { BookingStarted, BookingView } from '../services/bookings/booking.service';
import { BOOKING_NOT_FOUND_MESSAGE } from '../services/bookings/booking.service';
import type { RefundStatus } from '@devmentor/db';
import { bookingCancelSchema } from '../validators/bookings/booking-cancel.schema';
import { bookingReportSchema } from '../validators/bookings/booking-report.schema';
import { bookingStartSchema } from '../validators/bookings/booking-start.schema';
import type { ApiHandlerOptions, HandlerArgs, RouteParams } from './apiHandler';
import { BOOKING_CHANGE_RATE_LIMITS, BOOKING_START_RATE_LIMITS, rateLimitChecks } from '../security/rate-limit';
import { requireRole, requireSession } from './auth';
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
  await cradle.rateLimiter.consumeAll(rateLimitChecks(BOOKING_START_RATE_LIMITS, { email: user.email, ip: null }));

  return cradle.bookingService.start({ id: user.id, email: user.email }, input);
}

function bookingId(params: BookingIdParams): string {
  if (!z.uuid().safeParse(params.id).success) {
    throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
  }

  return params.id;
}

/** `GET /api/bookings/[id]` → the caller's own booking; anyone else's, unknown or malformed → 404. */
export async function getOwnBooking({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<BookingView> {
  const user = await requireSession(req, cradle);

  return cradle.bookingService.getOwn(user.id, bookingId(params));
}

/**
 * `POST /api/bookings/[id]/release` → the caller's own booking after releasing its hold (Cancel on
 * Stripe Checkout); a booking that is not held is returned unchanged.
 */
export async function releaseOwnBooking({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<BookingView> {
  const user = await requireSession(req, cradle);
  const id = bookingId(params);
  await cradle.rateLimiter.consumeAll(rateLimitChecks(BOOKING_CHANGE_RATE_LIMITS, { email: user.email, ip: null }));

  return cradle.bookingService.releaseOwnHold(user.id, id);
}

/**
 * `POST /api/bookings/[id]/cancel` `{ expectRefund }` → the caller's own booking, cancelled (spec
 * 2026-11-20-booking-cancellation). 409 `NOT_CANCELLABLE` or `CANCELLATION_TERMS_CHANGED`; a repeat
 * returns the cancelled booking.
 */
export async function cancelOwnBooking({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<BookingView> {
  const user = await requireSession(req, cradle);
  const id = bookingId(params);
  const input = await parseJsonBody(req, bookingCancelSchema);
  await cradle.rateLimiter.consumeAll(rateLimitChecks(BOOKING_CHANGE_RATE_LIMITS, { email: user.email, ip: null }));

  return cradle.bookingCancellationService.cancel(user.id, id, input);
}

/** `POST /api/admin/bookings/[id]/refund` (operators) → the refund status after one more try. */
export async function retryBookingRefund({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<{ refundStatus: RefundStatus }> {
  const user = await requireSession(req, cradle);
  requireRole(user, 'operator');

  return cradle.bookingCancellationService.retryRefund(bookingId(params));
}

/**
 * `POST /api/bookings/[id]/report` `{ message }` → `{ reportedAt }`: the caller reports their own paid
 * booking to the operator (R10). 409 `NOT_REPORTABLE` or `ALREADY_REPORTED`.
 */
export async function reportOwnBooking({ req, params, cradle }: HandlerArgs<BookingIdParams>): Promise<{ reportedAt: string }> {
  const user = await requireSession(req, cradle);
  const id = bookingId(params);
  const input = await parseJsonBody(req, bookingReportSchema);

  return cradle.bookingReportService.report(user.id, id, input);
}
