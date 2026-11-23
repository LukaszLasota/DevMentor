import { User } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { BOOKING_RESPONSE } from './bookings';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ConflictError } from './errors';
import { refreshConnect, releasePayouts, resolveReport, startConnect } from './payouts';

// Through the real apiHandler with fake services; the rules are tested in the services and end to end
// in `packages/app/integration/mentor-payouts.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-06-22T16:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const REPORT_ID = '7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60';
const START = apiHandler(startConnect, BOOKING_RESPONSE);
const REFRESH = apiHandler(refreshConnect, BOOKING_RESPONSE);
const RELEASE = apiHandler(releasePayouts, BOOKING_RESPONSE);
const RESOLVE = apiHandler(resolveReport, BOOKING_RESPONSE);

let roles: string[];
let services: Record<string, Record<string, ReturnType<typeof vi.fn>>>;

beforeEach(() => {
  roles = ['mentee', 'mentor'];
  const user = Object.assign(new User(), { id: USER_ID, email: 'ada@devmentor.test', sessionVersion: 0 });
  Object.defineProperty(user, 'roles', { get: () => roles });
  services = {
    connectService: { start: vi.fn(async () => ({ url: 'https://connect.stripe.test/x' })), refresh: vi.fn(async () => ({ onboardingStatus: 'enabled' })) },
    payoutService: { releaseDue: vi.fn(async () => ({ transferred: 1, held: 0, failed: 0, inFlight: 0, remaining: 0 })) },
    bookingReportService: { resolve: vi.fn(async () => ({ resolvedAt: '2026-06-22T16:00:00.000Z' })) },
  };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    em: { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) },
    accountService: { reconcileOperator: vi.fn(async (u: User) => u) },
    ...services,
  };
});

async function request({ csrf = true, signedIn = true } = {}): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

  return new Request('http://localhost/api/x', { method: 'POST', headers });
}

const noParams = { params: Promise.resolve({}) };
const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe('mentor Connect routes', () => {
  it('start and refresh act on the session mentor only, never cached', async () => {
    const started = await START(await request(), noParams);
    expect(started.headers.get('cache-control')).toBe('no-store');
    expect(await started.json()).toEqual({ ok: true, data: { url: 'https://connect.stripe.test/x' } });
    expect(services.connectService?.start).toHaveBeenCalledWith(USER_ID);

    expect(await (await REFRESH(await request(), noParams)).json()).toEqual({ ok: true, data: { onboardingStatus: 'enabled' } });
    expect(services.connectService?.refresh).toHaveBeenCalledWith(USER_ID);
  });

  it('answers 401 signed out, 403 without CSRF or the mentor role, and maps 409', async () => {
    expect((await START(await request({ signedIn: false }), noParams)).status).toBe(401);
    expect((await START(await request({ csrf: false }), noParams)).status).toBe(403);
    roles = ['mentee'];
    expect((await REFRESH(await request(), noParams)).status).toBe(403);

    roles = ['mentor'];
    services.connectService?.start?.mockRejectedValueOnce(new ConflictError('No.', { code: 'CONNECT_FAILED' }));
    expect((await (await START(await request(), noParams)).json()).error.code).toBe('CONNECT_FAILED');
  });
});

describe('operator payout routes', () => {
  it('release and resolve for an operator', async () => {
    roles = ['operator'];

    expect(await (await RELEASE(await request(), noParams)).json()).toEqual({ ok: true, data: { transferred: 1, held: 0, failed: 0, inFlight: 0, remaining: 0 } });
    expect(await (await RESOLVE(await request(), idParams(REPORT_ID))).json()).toEqual({ ok: true, data: { resolvedAt: '2026-06-22T16:00:00.000Z' } });
    expect(services.bookingReportService?.resolve).toHaveBeenCalledWith(USER_ID, REPORT_ID);
    // T-14: both money actions name the operator.
    expect((scope.cradle as { logger: { info: unknown } }).logger.info).toHaveBeenCalledWith(
      { operator: { id: USER_ID }, action: 'payouts.release', result: { transferred: 1, held: 0, failed: 0, inFlight: 0, remaining: 0 } },
      'Operator action',
    );
    expect((scope.cradle as { logger: { info: unknown } }).logger.info).toHaveBeenCalledWith({ operator: { id: USER_ID }, action: 'report.resolve', report: { id: REPORT_ID } }, 'Operator action');
  });

  it('refuse anyone else (403) and a malformed report id (404)', async () => {
    expect((await RELEASE(await request(), noParams)).status).toBe(403);
    expect((await RESOLVE(await request(), idParams(REPORT_ID))).status).toBe(403);
    expect(services.payoutService?.releaseDue).not.toHaveBeenCalled();

    roles = ['operator'];
    expect((await RESOLVE(await request(), idParams('x'))).status).toBe(404);
  });
});
