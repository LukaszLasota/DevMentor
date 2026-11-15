import { User, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession, verifySession } from '../security/session-token';
import {
  AlreadyMentorError,
  INVITATION_EMAIL_MISMATCH_MESSAGE,
  INVITATION_INVALID_MESSAGE,
} from '../services/invitations/invitation.service';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ForbiddenError, NotFoundError } from './errors';
import { acceptInvitation, INVITATION_RESPONSE, lookupInvitation, MENTOR_HOME } from './invitations';

// The handlers run through the real apiHandler (CSRF, envelope, error mapping, headers) with a fake
// InvitationService: its rules (404 states, lock order, ALREADY_MENTOR, mismatch) are tested in
// `invitation.service.test.ts` and against PostgreSQL in `packages/app/integration/`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-11-14T12:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const TOKEN = 'raw-invitation-token';
const DUE = new Date('2026-11-28T12:00:00.000Z');
const BASE_ENV = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET };
const params = { params: Promise.resolve({ token: TOKEN }) };
const NO_STORE = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' };

function setup(env: Record<string, string | undefined> = BASE_ENV) {
  const user = Object.assign(new User(), {
    id: USER_ID,
    email: 'ada@devmentor.test',
    roles: ['mentee'] as Role[],
    sessionVersion: 2,
    emailVerifiedAt: new Date('2026-11-01T00:00:00.000Z'),
  });
  const invitationService = {
    lookup: vi.fn(async () => ({ email: 'ada@devmentor.test', stackTags: ['typescript'] })),
    // Like the real service: grants mentor and bumps session_version in its transaction.
    accept: vi.fn(async () => {
      user.roles = ['mentee', 'mentor'];
      user.sessionVersion += 1;
      return { roles: user.roles, publishDueAt: DUE, sessionVersion: user.sessionVersion, changed: true };
    }),
  };
  const em = { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) };
  const accountService = { reconcileOperator: vi.fn(async (u: User) => u) };
  scope.cradle = { env: parseEnv(env), clock, logger: { warn: vi.fn(), error: vi.fn() }, em, accountService, invitationService };

  return { user, invitationService };
}

const lookup = apiHandler(lookupInvitation, INVITATION_RESPONSE);
const accept = apiHandler(acceptInvitation, INVITATION_RESPONSE);

function request(method: 'GET' | 'POST', { csrf = true, cookie }: { csrf?: boolean; cookie?: string } = {}): Request {
  const headers: Record<string, string> = {};

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (cookie !== undefined) headers.cookie = cookie;

  return new Request(`http://localhost/api/invitations/${TOKEN}${method === 'POST' ? '/accept' : ''}`, { method, headers });
}

const session = (sv: number) => signSession({ sub: USER_ID, sv }, SECRET, clock).then((t) => `dm_session=${t}`);

function expectNoStore(res: Response): void {
  expect({
    'cache-control': res.headers.get('cache-control'),
    'referrer-policy': res.headers.get('referrer-policy'),
  }).toEqual(NO_STORE);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/invitations/[token]', () => {
  it('answers the invited email and stack tags with no-store and no-referrer', async () => {
    const { invitationService } = setup();

    const res = await lookup(request('GET', { csrf: false }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { email: 'ada@devmentor.test', stackTags: ['typescript'] } });
    expect(invitationService.lookup).toHaveBeenCalledWith(TOKEN);
    expectNoStore(res);
  });

  it('answers 404 with the one message, with the same headers', async () => {
    const { invitationService } = setup();
    invitationService.lookup.mockRejectedValueOnce(new NotFoundError(INVITATION_INVALID_MESSAGE));

    const res = await lookup(request('GET', { csrf: false }), params);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: INVITATION_INVALID_MESSAGE } });
    expectNoStore(res);
  });
});

describe('POST /api/invitations/[token]/accept', () => {
  it('accepts for the session user and re-issues dm_session with the new session_version', async () => {
    const { user, invitationService } = setup();

    const res = await accept(request('POST', { cookie: await session(2) }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { roles: ['mentee', 'mentor'], publishDueAt: DUE.toISOString(), redirect: MENTOR_HOME },
    });
    expect(invitationService.accept).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ id: USER_ID }));
    const [cookie = ''] = res.headers.getSetCookie();
    expect(cookie).toMatch(/^dm_session=[\w-]+\.[\w-]+\.[\w-]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=86400$/);
    const token = cookie.split(';')[0]?.slice('dm_session='.length) ?? '';
    expect(user.sessionVersion).toBe(3);
    expect(await verifySession(token, { current: SECRET }, clock)).toMatchObject({ sub: USER_ID, sv: 3 });
    expectNoStore(res);
  });

  it('re-issues the cookie also when nothing changed (same session_version)', async () => {
    const { invitationService } = setup();
    invitationService.accept.mockResolvedValueOnce({ roles: ['mentee', 'mentor'], publishDueAt: DUE, sessionVersion: 2, changed: false });

    const res = await accept(request('POST', { cookie: await session(2) }), params);
    const token = res.headers.getSetCookie()[0]?.split(';')[0]?.slice('dm_session='.length) ?? '';

    expect(res.status).toBe(200);
    expect(await verifySession(token, { current: SECRET }, clock)).toMatchObject({ sv: 2 });
  });

  it.each([
    ['no cookie', undefined],
    ['a stale session_version', 1],
  ])('is 401 with %s, before the service', async (_case, sv) => {
    const { invitationService } = setup();

    const res = await accept(request('POST', { cookie: sv === undefined ? undefined : await session(sv) }), params);

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(invitationService.accept).not.toHaveBeenCalled();
    expectNoStore(res);
  });

  it('is 403 without the CSRF header, before the session check and the service', async () => {
    const { invitationService } = setup();

    const res = await accept(request('POST', { csrf: false, cookie: await session(2) }), params);

    expect(res.status).toBe(403);
    expect(invitationService.accept).not.toHaveBeenCalled();
  });

  it('is 503 without SESSION_SECRET, before the service', async () => {
    const { invitationService } = setup({ DATABASE_URL: BASE_ENV.DATABASE_URL });

    const res = await accept(request('POST'), params);

    expect(res.status).toBe(503);
    expect(invitationService.accept).not.toHaveBeenCalled();
  });

  it.each([
    ['an invalid token', new NotFoundError(INVITATION_INVALID_MESSAGE), 404, 'NOT_FOUND'],
    ['a link this account already used', new AlreadyMentorError(), 409, 'ALREADY_MENTOR'],
    ['another or an unverified email', new ForbiddenError(INVITATION_EMAIL_MISMATCH_MESSAGE), 403, 'FORBIDDEN'],
  ])('passes on %s as %i without a new session', async (_case, error, status, code) => {
    const { invitationService } = setup();
    invitationService.accept.mockRejectedValueOnce(error);

    const res = await accept(request('POST', { cookie: await session(2) }), params);

    expect(res.status).toBe(status);
    expect((await res.json()).error).toEqual({ code, message: error.message });
    expect(res.headers.getSetCookie()).toEqual([]);
    expectNoStore(res);
  });
});
