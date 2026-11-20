import { User, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { listMySlots, publishSlot, removeSlot } from './availability';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ConflictError, NotFoundError } from './errors';
import { MENTOR_OWNER_RESPONSE } from './mentors';

// The handlers run through the real apiHandler (CSRF, envelope, error mapping, no-store) with a fake
// SlotService: its rules are tested in `slot.service.test.ts` and against PostgreSQL in
// `packages/app/integration/availability-slots.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-06-22T16:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const SLOT_ID = '6f1d0c3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f';
const SLOT = { id: SLOT_ID, startsAt: '2026-06-23T09:00:00.000Z', meetsLeadTime: true };

function setup(roles: Role[] = ['mentee', 'mentor']) {
  const user = Object.assign(new User(), { id: USER_ID, email: 'ada@devmentor.test', roles, sessionVersion: 0 });
  const slotService = {
    listMine: vi.fn(async () => [SLOT]),
    publish: vi.fn(async () => SLOT),
    remove: vi.fn(async () => ({ id: SLOT_ID })),
  };
  const em = { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { warn: vi.fn(), error: vi.fn() },
    em,
    accountService: { reconcileOperator: vi.fn(async (u: User) => u) },
    slotService,
  };

  return { slotService };
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  { path = '/api/availability/slots', csrf = true, signedIn = true, body }: { path?: string; csrf?: boolean; signedIn?: boolean; body?: unknown } = {},
): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

  return new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const noParams = { params: Promise.resolve({}) };
const idParams = { params: Promise.resolve({ id: SLOT_ID }) };
const routes = {
  list: apiHandler(listMySlots, MENTOR_OWNER_RESPONSE),
  publish: apiHandler(publishSlot, MENTOR_OWNER_RESPONSE),
  remove: apiHandler(removeSlot, MENTOR_OWNER_RESPONSE),
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/availability/slots', () => {
  it('lists the session mentor\'s upcoming slots by default, with no-store', async () => {
    const { slotService } = setup();

    const res = await routes.list(await request('GET', { csrf: false }), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { items: [SLOT] } });
    expect(slotService.listMine).toHaveBeenCalledWith(USER_ID, 'upcoming');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('passes scope=past and refuses an unknown scope with 400', async () => {
    const { slotService } = setup();

    await routes.list(await request('GET', { csrf: false, path: '/api/availability/slots?scope=past' }), noParams);
    const bad = await routes.list(await request('GET', { csrf: false, path: '/api/availability/slots?scope=all' }), noParams);

    expect(slotService.listMine).toHaveBeenCalledExactlyOnceWith(USER_ID, 'past');
    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).error.fieldErrors)).toEqual(['scope']);
  });
});

describe('POST /api/availability/slots', () => {
  it('publishes the parsed start for the session mentor (no mass assignment)', async () => {
    const { slotService } = setup();

    const res = await routes.publish(
      await request('POST', { body: { startsAt: '2026-06-23T09:00:00.000Z', mentorProfileId: 'someone-else' } }),
      noParams,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: SLOT });
    expect(slotService.publish).toHaveBeenCalledWith(USER_ID, { startsAt: '2026-06-23T09:00:00.000Z' });
  });

  it('answers 400 on a malformed start and 409 from the service, with no-store', async () => {
    const { slotService } = setup();
    slotService.publish.mockRejectedValueOnce(new ConflictError('You already have a slot at this time.'));

    const malformed = await routes.publish(await request('POST', { body: { startsAt: '2026-06-23T11:00:00+02:00' } }), noParams);
    const duplicate = await routes.publish(await request('POST', { body: { startsAt: '2026-06-23T09:00:00.000Z' } }), noParams);

    expect(malformed.status).toBe(400);
    expect(Object.keys((await malformed.json()).error.fieldErrors)).toEqual(['startsAt']);
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe('CONFLICT');
    expect(duplicate.headers.get('cache-control')).toBe('no-store');
  });
});

describe('DELETE /api/availability/slots/[id]', () => {
  it('removes the path id for the session mentor; 404 passes through', async () => {
    const { slotService } = setup();

    const res = await routes.remove(await request('DELETE', { path: `/api/availability/slots/${SLOT_ID}` }), idParams);
    slotService.remove.mockRejectedValueOnce(new NotFoundError('Slot not found.'));
    const missing = await routes.remove(await request('DELETE', { path: `/api/availability/slots/${SLOT_ID}` }), idParams);

    expect(await res.json()).toEqual({ ok: true, data: { id: SLOT_ID } });
    expect(slotService.remove).toHaveBeenCalledWith(USER_ID, SLOT_ID);
    expect(missing.status).toBe(404);
  });
});

describe('slot routes — access', () => {
  it.each([
    ['GET', () => routes.list, 'GET'],
    ['POST', () => routes.publish, 'POST'],
    ['DELETE', () => routes.remove, 'DELETE'],
  ] as const)('%s answers 401 signed out and 403 for a non-mentor, calling no service', async (_name, route, method) => {
    const params = idParams; // extra params are ignored by the list and publish handlers
    const { slotService } = setup(['mentee']);
    const body = method === 'POST' ? { startsAt: '2026-06-23T09:00:00.000Z' } : undefined;

    const anonymous = await route()(await request(method, { signedIn: false, body }), params);
    const mentee = await route()(await request(method, { body }), params);

    expect([anonymous.status, mentee.status]).toEqual([401, 403]);
    expect(Object.values(slotService).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ['POST', () => routes.publish],
    ['DELETE', () => routes.remove],
  ] as const)('%s needs the CSRF header', async (method, route) => {
    setup();
    const params = idParams;

    const res = await route()(await request(method, { csrf: false, body: method === 'POST' ? {} : undefined }), params);

    expect(res.status).toBe(403);
  });

  it('maps a mentor without a profile to 404', async () => {
    const { slotService } = setup();
    slotService.listMine.mockRejectedValueOnce(new NotFoundError('Mentor profile not found.'));

    expect((await routes.list(await request('GET', { csrf: false }), noParams)).status).toBe(404);
  });
});
