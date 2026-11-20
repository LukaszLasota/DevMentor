import { User, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession } from '../security/session-token';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { NotFoundError, ServiceUnavailableError, ValidationError } from './errors';
import {
  getOwnMentorPage,
  getPublicMentorPage,
  MENTOR_OWNER_RESPONSE,
  publishOwnMentorPage,
  unpublishOwnMentorPage,
  updateOwnMentorPage,
  updateOwnMentorPrices,
} from './mentors';

// The handlers run through the real apiHandler (CSRF, envelope, error mapping, headers) with a fake
// MentorProfileService: its rules are tested in `mentor-profile.service.test.ts` and against
// PostgreSQL in `packages/app/integration/mentor-page.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-11-20T10:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const OWNER = { slug: null, displayName: 'Ada', readiness: [] };
const PUBLIC = { slug: 'ada', displayName: 'Ada' };
const noParams = { params: Promise.resolve({}) };

function setup(roles: Role[] = ['mentee', 'mentor']) {
  const user = Object.assign(new User(), { id: USER_ID, email: 'ada@devmentor.test', roles, sessionVersion: 0 });
  const mentorProfileService = {
    getOwn: vi.fn(async () => OWNER),
    updateOwn: vi.fn(async () => OWNER),
    publish: vi.fn(async () => OWNER),
    unpublish: vi.fn(async () => OWNER),
    getPublicBySlug: vi.fn(async () => PUBLIC),
    updatePrices: vi.fn(async () => OWNER),
  };
  const em = { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) };
  const accountService = { reconcileOperator: vi.fn(async (u: User) => u) };
  scope.cradle = {
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET }),
    clock,
    logger: { warn: vi.fn(), error: vi.fn() },
    em,
    accountService,
    mentorProfileService,
  };

  return { mentorProfileService };
}

const session = () => signSession({ sub: USER_ID, sv: 0 }, SECRET, clock).then((t) => `dm_session=${t}`);

async function request(
  method: 'GET' | 'PUT' | 'POST',
  { csrf = true, signedIn = true, body }: { csrf?: boolean; signedIn?: boolean; body?: unknown } = {},
): Promise<Request> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (signedIn) headers.cookie = await session();

  return new Request('http://localhost/api/mentors/me', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const routes = {
  get: apiHandler(getOwnMentorPage, MENTOR_OWNER_RESPONSE),
  put: apiHandler(updateOwnMentorPage, MENTOR_OWNER_RESPONSE),
  publish: apiHandler(publishOwnMentorPage, MENTOR_OWNER_RESPONSE),
  unpublish: apiHandler(unpublishOwnMentorPage, MENTOR_OWNER_RESPONSE),
  prices: apiHandler(updateOwnMentorPrices, MENTOR_OWNER_RESPONSE),
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('owner routes /api/mentors/me', () => {
  it('GET answers the owner DTO of the session user with no-store', async () => {
    const { mentorProfileService } = setup();

    const res = await routes.get(await request('GET', { csrf: false }), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: OWNER });
    expect(mentorProfileService.getOwn).toHaveBeenCalledWith(USER_ID);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('PUT passes only the parsed schema output (no mass assignment)', async () => {
    const { mentorProfileService } = setup();

    const res = await routes.put(
      await request('PUT', { body: { displayName: ' Ada ', publicWorkUrl: '', slug: 'admin', userId: 'someone' } }),
      noParams,
    );

    expect(res.status).toBe(200);
    expect(mentorProfileService.updateOwn).toHaveBeenCalledWith(USER_ID, { displayName: 'Ada', publicWorkUrl: null });
  });

  it('PUT answers 400 with field errors for an invalid body, with no-store', async () => {
    const { mentorProfileService } = setup();

    const res = await routes.put(await request('PUT', { body: { publicWorkUrl: 'javascript:alert(1)' } }), noParams);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(body.error.fieldErrors)).toEqual(['publicWorkUrl']);
    expect(mentorProfileService.updateOwn).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('POST publish and unpublish act on the session user', async () => {
    const { mentorProfileService } = setup();

    expect((await routes.publish(await request('POST'), noParams)).status).toBe(200);
    expect((await routes.unpublish(await request('POST'), noParams)).status).toBe(200);
    expect(mentorProfileService.publish).toHaveBeenCalledWith(USER_ID);
    expect(mentorProfileService.unpublish).toHaveBeenCalledWith(USER_ID);
  });

  it('a refused publish keeps its field errors in the envelope', async () => {
    const { mentorProfileService } = setup();
    mentorProfileService.publish.mockRejectedValueOnce(
      new ValidationError('Not ready.', { publicWorkUrl: ['Add a link to your public work.'] }),
    );

    const res = await routes.publish(await request('POST'), noParams);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Not ready.', fieldErrors: { publicWorkUrl: ['Add a link to your public work.'] } },
    });
  });

  it.each([
    ['GET', routes.get],
    ['PUT', routes.put],
    ['POST publish', routes.publish],
    ['POST unpublish', routes.unpublish],
  ] as const)('%s answers 401 without a session and 403 without the mentor role', async (method, route) => {
    const verb = method.startsWith('POST') ? 'POST' : (method as 'GET' | 'PUT');
    const { mentorProfileService } = setup(['mentee']);

    const anonymous = await route(await request(verb, { signedIn: false, body: verb === 'PUT' ? {} : undefined }), noParams);
    const mentee = await route(await request(verb, { body: verb === 'PUT' ? {} : undefined }), noParams);

    expect(anonymous.status).toBe(401);
    expect(mentee.status).toBe(403);
    expect(mentee.headers.get('cache-control')).toBe('no-store');
    expect(Object.values(mentorProfileService).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it.each([
    ['PUT', routes.put],
    ['POST publish', routes.publish],
    ['POST unpublish', routes.unpublish],
  ] as const)('%s needs the CSRF header', async (method, route) => {
    setup();

    const res = await route(await request(method === 'PUT' ? 'PUT' : 'POST', { csrf: false, body: {} }), noParams);

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/mentors/me/prices (#24)', () => {
  it('passes both parsed price strings for the session mentor, with no-store', async () => {
    const { mentorProfileService } = setup();

    const res = await routes.prices(await request('PUT', { body: { price25: '150', price50: '300.50', currency: 'USD' } }), noParams);

    expect(res.status).toBe(200);
    expect(mentorProfileService.updatePrices).toHaveBeenCalledWith(USER_ID, { price25: '150', price50: '300.50' });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 400 for malformed amounts and keeps the service\'s range errors and 503', async () => {
    const { mentorProfileService } = setup();
    mentorProfileService.updatePrices
      .mockRejectedValueOnce(new ValidationError('A price is outside the allowed range; nothing was saved.', { price25: ['Allowed: PLN 50.00–PLN 300.00'], price50: ['Allowed: PLN 100.00–PLN 600.00'] }))
      .mockRejectedValueOnce(new ServiceUnavailableError('Prices cannot be set right now.'));

    const malformed = await routes.prices(await request('PUT', { body: { price25: '1e3', price50: '-5' } }), noParams);
    const outside = await routes.prices(await request('PUT', { body: { price25: '1', price50: '9000' } }), noParams);
    const unavailable = await routes.prices(await request('PUT', { body: { price25: '150', price50: '300' } }), noParams);

    expect(malformed.status).toBe(400);
    expect(Object.keys((await malformed.json()).error.fieldErrors).sort()).toEqual(['price25', 'price50']);
    expect(outside.status).toBe(400);
    expect(Object.keys((await outside.json()).error.fieldErrors).sort()).toEqual(['price25', 'price50']);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 401 signed out, 403 for a non-mentor, 403 without CSRF and 404 without a profile', async () => {
    const { mentorProfileService } = setup(['mentee', 'operator']);
    const body = { price25: '150', price50: '300' };

    const anonymous = await routes.prices(await request('PUT', { signedIn: false, body }), noParams);
    const operator = await routes.prices(await request('PUT', { body }), noParams);
    const { mentorProfileService: csrfCase } = setup();
    const noCsrf = await routes.prices(await request('PUT', { csrf: false, body }), noParams);
    expect(csrfCase.updatePrices).not.toHaveBeenCalled();
    const { mentorProfileService: withoutProfile } = setup();
    withoutProfile.updatePrices.mockRejectedValueOnce(new NotFoundError('Mentor profile not found.'));
    const missing = await routes.prices(await request('PUT', { body }), noParams);

    expect([anonymous.status, operator.status, noCsrf.status, missing.status]).toEqual([401, 403, 403, 404]);
    expect(mentorProfileService.updatePrices).not.toHaveBeenCalled();
  });
});

describe('GET /api/mentors/[slug] (public)', () => {
  const route = apiHandler(getPublicMentorPage);

  it('answers the public DTO without a session', async () => {
    const { mentorProfileService } = setup();

    const res = await route(new Request('http://localhost/api/mentors/ada'), { params: Promise.resolve({ slug: 'ada' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: PUBLIC });
    expect(mentorProfileService.getPublicBySlug).toHaveBeenCalledWith('ada');
  });

  it('answers 404 for a page that is not public', async () => {
    const { mentorProfileService } = setup();
    mentorProfileService.getPublicBySlug.mockRejectedValueOnce(new NotFoundError('Mentor page not found.'));

    const res = await route(new Request('http://localhost/api/mentors/x'), { params: Promise.resolve({ slug: 'x' }) });

    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});
