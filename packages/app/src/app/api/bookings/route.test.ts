// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // The behaviour is tested in core (`bookings.test.ts`, through the real apiHandler) and over HTTP
  // in `integration/booking-checkout.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  startBooking: 'startBooking',
  getOwnBooking: 'getOwnBooking',
  releaseOwnBooking: 'releaseOwnBooking',
  cancelOwnBooking: 'cancelOwnBooking',
  retryBookingRefund: 'retryBookingRefund',
  BOOKING_RESPONSE: 'BOOKING_RESPONSE',
}));

describe('booking routes', () => {
  it('POST /api/bookings wires startBooking with no-store', async () => {
    expect((await import('./route')).POST).toEqual({ handler: 'startBooking', options: 'BOOKING_RESPONSE' });
  });

  it('GET /api/bookings/[id] wires getOwnBooking with no-store', async () => {
    expect((await import('./[id]/route')).GET).toEqual({ handler: 'getOwnBooking', options: 'BOOKING_RESPONSE' });
  });

  it('POST /api/bookings/[id]/release wires releaseOwnBooking with no-store', async () => {
    expect((await import('./[id]/release/route')).POST).toEqual({ handler: 'releaseOwnBooking', options: 'BOOKING_RESPONSE' });
  });

  it('POST /api/bookings/[id]/cancel wires cancelOwnBooking with no-store', async () => {
    expect((await import('./[id]/cancel/route')).POST).toEqual({ handler: 'cancelOwnBooking', options: 'BOOKING_RESPONSE' });
  });

  it('POST /api/admin/bookings/[id]/refund wires retryBookingRefund with no-store', async () => {
    expect((await import('../admin/bookings/[id]/refund/route')).POST).toEqual({ handler: 'retryBookingRefund', options: 'BOOKING_RESPONSE' });
  });
});
