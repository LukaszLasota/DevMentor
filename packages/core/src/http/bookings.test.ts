import { User } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { BOOKING_RESPONSE, getOwnBooking, releaseOwnBooking, startBooking } from './bookings';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from './errors';

// The handlers run through the real apiHandler (CSRF, envelope, error mapping, no-store) with a fake
// BookingService: its rules are tested in `booking.service.test.ts` and end to end against PostgreSQL
// and the Stripe stub in `packages/app/integration/booking-checkout.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-06-22T16:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const SLOT_ID = '6f1d0c3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f';
const BOOKING_ID = '7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60';
const STARTED = { bookingId: BOOKING_ID, checkoutUrl: 'https://checkout.test/cs_1' };
const VIEW = { id: BOOKING_ID, status: 'confirmed' };
const START = apiHandler(startBooking, BOOKING_RESPONSE);
const GET = apiHandler(getOwnBooking, BOOKING_RESPONSE);
const RELEASE = apiHandler(releaseOwnBooking, BOOKING_RESPONSE);

let bookingService: { start: ReturnType<typeof vi.fn>; getOwn: ReturnType<typeof vi.fn>; releaseOwnHold: ReturnType<typeof vi.fn> };

beforeEach(() => {
  const user = Object.assign(new User(), { id: USER_ID, email: 'mentee@devmentor.test', roles: ['mentee'], sessionVersion: 0 });
  bookingService = { start: vi.fn(async () => STARTED), getOwn: vi.fn(async () => VIEW), releaseOwnHold: vi.fn(async () => VIEW) };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { warn: vi.fn(), error: vi.fn() },
    em: { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) },
    accountService: { reconcileOperator: vi.fn(async (u: User) => u) },
    bookingService,
  };
});

async function request(
  method: 'GET' | 'POST',
  { csrf = true, signedIn = true, body }: { csrf?: boolean; signedIn?: boolean; body?: unknown } = {},
): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

  return new Request('http://localhost/api/bookings', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const noParams = { params: Promise.resolve({}) };
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/bookings', () => {
  it('starts a booking for the session user with the parsed input only, never cached', async () => {
    const response = await START(await request('POST', { body: { slotId: SLOT_ID, length: '25', priceCents: 1 } }), noParams);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: STARTED });
    expect(bookingService.start).toHaveBeenCalledWith({ id: USER_ID, email: 'mentee@devmentor.test' }, { slotId: SLOT_ID, length: '25' });
  });

  it('answers 401 signed out, 403 without the CSRF header and 400 for a bad length', async () => {
    expect((await START(await request('POST', { signedIn: false, body: { slotId: SLOT_ID, length: '25' } }), noParams)).status).toBe(401);
    expect((await START(await request('POST', { csrf: false, body: { slotId: SLOT_ID, length: '25' } }), noParams)).status).toBe(403);

    const bad = await START(await request('POST', { body: { slotId: SLOT_ID, length: '30' } }), noParams);
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).error.fieldErrors)).toEqual(['length']);
    expect(bookingService.start).not.toHaveBeenCalled();
  });

  it.each([
    [new ConflictError('Taken.', { code: 'SLOT_TAKEN' }), 409, 'SLOT_TAKEN'],
    [new ConflictError('No.', { code: 'NOT_BOOKABLE' }), 409, 'NOT_BOOKABLE'],
    [new ForbiddenError('Own.'), 403, 'FORBIDDEN'],
    [new NotFoundError('Gone.'), 404, 'NOT_FOUND'],
    [new ServiceUnavailableError('Off.', { code: 'PAYMENTS_UNAVAILABLE' }), 503, 'PAYMENTS_UNAVAILABLE'],
  ])('maps %o to %i %s', async (error, status, code) => {
    bookingService.start.mockRejectedValueOnce(error);

    const response = await START(await request('POST', { body: { slotId: SLOT_ID, length: '50' } }), noParams);

    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
});

describe('GET /api/bookings/[id]', () => {
  it('returns the caller\'s own booking, never cached', async () => {
    const response = await GET(await request('GET'), idParams(BOOKING_ID));

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: VIEW });
    expect(bookingService.getOwn).toHaveBeenCalledWith(USER_ID, BOOKING_ID);
  });

  it('answers 404 for a malformed id without asking the service, and 401 signed out', async () => {
    expect((await GET(await request('GET'), idParams('nope'))).status).toBe(404);
    expect(bookingService.getOwn).not.toHaveBeenCalled();
    expect((await GET(await request('GET', { signedIn: false }), idParams(BOOKING_ID))).status).toBe(401);
  });
});

describe('POST /api/bookings/[id]/release', () => {
  it('releases the caller\'s own hold with the CSRF header', async () => {
    const response = await RELEASE(await request('POST'), idParams(BOOKING_ID));

    expect(await response.json()).toEqual({ ok: true, data: VIEW });
    expect(bookingService.releaseOwnHold).toHaveBeenCalledWith(USER_ID, BOOKING_ID);
  });

  it('answers 403 without the CSRF header and 404 for a malformed id', async () => {
    expect((await RELEASE(await request('POST', { csrf: false }), idParams(BOOKING_ID))).status).toBe(403);
    expect((await RELEASE(await request('POST'), idParams('x'))).status).toBe(404);
    expect(bookingService.releaseOwnHold).not.toHaveBeenCalled();
  });
});
