import { User, type Role } from '@devmentor/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env';
import { signSession, verifySession } from '../security/session-token';
import {
  INVALID_CREDENTIALS_MESSAGE,
  VerificationLinkInvalidError,
  type SetPasswordFromLinkInput,
} from '../services/auth/account.service';
import type { Clock } from '../time/clock';
import { apiHandler } from './apiHandler';
import { requireSession } from './auth';
import {
  CHECK_INBOX_RESPONSE,
  registerWithEmail,
  resendVerificationLink,
  signInWithPassword,
  VERIFY_EMAIL_RESPONSE,
  verifyEmailAndSetPassword,
} from './email-sign-in';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from './envelope';
import { ServiceUnavailableError, TooManyRequestsError, UnauthorizedError } from './errors';

// The handlers run through the real apiHandler (CSRF, envelope, error mapping, headers) with a fake
// AccountService: its behaviour (limits, mails, link checks, hashing) is tested in
// `account.service.test.ts` and over HTTP in `packages/app/integration/email-sign-in.test.ts`.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-11-14T12:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const OTHER_ID = '7d1e2f3a-4b5c-4d6e-8f7a-1b2c3d4e5f6a';
const BASE_ENV = { DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: SECRET, TRUSTED_PROXY_HOPS: '1' };
const PASSWORD = 'correct horse battery';
const TOKEN = 'raw-link-token';
const noParams = { params: Promise.resolve({}) };

function makeUser(id = USER_ID, roles: Role[] = ['mentee'], sessionVersion = 0): User {
  return Object.assign(new User(), {
    id,
    email: `${id === USER_ID ? 'ada' : 'other'}@devmentor.test`,
    roles,
    sessionVersion,
    emailVerifiedAt: new Date('2026-11-01T00:00:00.000Z'),
  });
}

function setup(env: Record<string, string | undefined> = {}) {
  const users = [makeUser(), makeUser(OTHER_ID)];
  const [user] = users as [User, User];
  const accountService = {
    startRegistration: vi.fn(async () => undefined),
    resendVerification: vi.fn(async () => undefined),
    verifyPassword: vi.fn(async () => user),
    // Like the real service: refuses another account's live session, else sets and bumps.
    setPasswordFromLink: vi.fn(async (_input: SetPasswordFromLinkInput, currentUserId: string | null) => {
      if (currentUserId !== null && currentUserId !== user.id) {
        throw new VerificationLinkInvalidError();
      }

      user.sessionVersion += 1;
      return { user, redirectTo: '/mentors' };
    }),
    reconcileOperator: vi.fn(async (u: User) => u),
  };
  const em = { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => users.find((u) => u.id === where.id) ?? null) };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
  scope.cradle = { env: parseEnv({ ...BASE_ENV, ...env }), clock, logger, em, accountService };

  return { user, accountService, cradle: scope.cradle as Parameters<typeof requireSession>[1] };
}

const register = apiHandler(registerWithEmail, CHECK_INBOX_RESPONSE);
const resend = apiHandler(resendVerificationLink, CHECK_INBOX_RESPONSE);
const signIn = apiHandler(signInWithPassword);
const verifyEmail = apiHandler(verifyEmailAndSetPassword, VERIFY_EMAIL_RESPONSE);

function post(body: unknown, { csrf = true, cookie }: { csrf?: boolean; cookie?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' };

  if (csrf) headers[CSRF_HEADER] = CSRF_HEADER_VALUE;
  if (cookie !== undefined) headers.cookie = cookie;

  return new Request('http://localhost/api/auth/x', { method: 'POST', headers, body: JSON.stringify(body) });
}

const session = (sub: string, sv: number) => signSession({ sub, sv }, SECRET, clock).then((t) => `dm_session=${t}`);

/** The `dm_session` token the response set. */
function sessionToken(res: Response): string {
  const [cookie = ''] = res.headers.getSetCookie();
  expect(cookie).toMatch(/^dm_session=[\w-]+\.[\w-]+\.[\w-]+; HttpOnly; SameSite=Lax; Path=\/; Max-Age=86400$/);

  return cookie.split(';')[0]?.slice('dm_session='.length) ?? '';
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ['POST /api/auth/register', register, 'startRegistration'],
  ['POST /api/auth/verify-email/resend', resend, 'resendVerification'],
] as const)('%s', (_route, handler, method) => {
  it('answers 202 check-inbox and passes the parsed email, returnTo and client IP on', async () => {
    const { accountService } = setup();

    const res = await handler(post({ email: '  Ada@DevMentor.test ', returnTo: '/mentors/42' }), noParams);

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ ok: true, data: { status: 'check-inbox' } });
    expect(accountService[method]).toHaveBeenCalledWith(
      { email: 'ada@devmentor.test', returnTo: '/mentors/42' },
      { ip: '203.0.113.7' },
    );
  });

  it('is 429 with Retry-After and retryAfterSeconds when a limit is hit', async () => {
    const { accountService } = setup();
    accountService[method].mockRejectedValueOnce(new TooManyRequestsError(120));

    const res = await handler(post({ email: 'ada@devmentor.test' }), noParams);

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
    expect((await res.json()).error).toMatchObject({ code: 'TOO_MANY_REQUESTS', retryAfterSeconds: 120 });
  });

  it('is 503 when the mail cannot be delivered', async () => {
    const { accountService } = setup();
    accountService[method].mockRejectedValueOnce(new ServiceUnavailableError('Mail delivery failed.'));

    const res = await handler(post({ email: 'ada@devmentor.test' }), noParams);

    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('is 400 with field errors for an invalid email, before the service', async () => {
    const { accountService } = setup();

    const res = await handler(post({ email: 'not-an-email' }), noParams);

    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors.email).toBeDefined();
    expect(accountService[method]).not.toHaveBeenCalled();
  });

  it('is 403 without the CSRF header, before the service', async () => {
    const { accountService } = setup();

    const res = await handler(post({ email: 'ada@devmentor.test' }, { csrf: false }), noParams);

    expect(res.status).toBe(403);
    expect(accountService[method]).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/sign-in', () => {
  it('returns the user DTO and sets dm_session with the current session_version', async () => {
    const { user, accountService } = setup();
    user.sessionVersion = 4;

    const res = await signIn(post({ email: 'Ada@devmentor.test', password: PASSWORD }), noParams);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        user: { id: USER_ID, email: 'ada@devmentor.test', roles: ['mentee'], githubLogin: null, avatarUrl: null, emailVerified: true },
      },
    });
    expect(accountService.verifyPassword).toHaveBeenCalledWith(
      { email: 'ada@devmentor.test', password: PASSWORD },
      { ip: '203.0.113.7' },
    );
    expect(await verifySession(sessionToken(res), { current: SECRET }, clock)).toMatchObject({ sub: USER_ID, sv: 4 });
  });

  it('is 401 with the one credentials message and no cookie', async () => {
    const { accountService } = setup();
    accountService.verifyPassword.mockRejectedValueOnce(new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE));

    const res = await signIn(post({ email: 'ada@devmentor.test', password: 'wrong' }), noParams);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' },
    });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('is 429 with Retry-After', async () => {
    const { accountService } = setup();
    accountService.verifyPassword.mockRejectedValueOnce(new TooManyRequestsError(300));

    const res = await signIn(post({ email: 'ada@devmentor.test', password: PASSWORD }), noParams);

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('300');
    expect((await res.json()).error.retryAfterSeconds).toBe(300);
  });

  it('is 503 without SESSION_SECRET, before any password work', async () => {
    const { accountService } = setup({ SESSION_SECRET: undefined });

    const res = await signIn(post({ email: 'ada@devmentor.test', password: PASSWORD }), noParams);

    expect(res.status).toBe(503);
    expect(accountService.verifyPassword).not.toHaveBeenCalled();
  });

  it('is 403 without the CSRF header', async () => {
    const { accountService } = setup();

    const res = await signIn(post({ email: 'ada@devmentor.test', password: PASSWORD }, { csrf: false }), noParams);

    expect(res.status).toBe(403);
    expect(accountService.verifyPassword).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/verify-email', () => {
  const body = { token: TOKEN, password: PASSWORD, returnTo: '/mentors' };

  it('sets the password, signs in with the bumped session_version and refuses the old cookie afterwards', async () => {
    const { user, accountService, cradle } = setup();
    const oldCookie = await session(USER_ID, 0);

    const res = await verifyEmail(post(body, { cookie: oldCookie }), noParams);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await res.json()).toEqual({
      ok: true,
      data: { user: expect.objectContaining({ id: USER_ID, emailVerified: true }), redirectTo: '/mentors' },
    });
    // The link's own account signed in: passed on, not refused.
    expect(accountService.setPasswordFromLink).toHaveBeenCalledWith(body, USER_ID);
    expect(user.sessionVersion).toBe(1);

    const newToken = sessionToken(res);
    expect(await verifySession(newToken, { current: SECRET }, clock)).toMatchObject({ sub: USER_ID, sv: 1 });

    const meWith = (cookie: string) => requireSession(new Request('http://localhost/api/auth/me', { headers: { cookie } }), cradle);
    await expect(meWith(oldCookie)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(meWith(`dm_session=${newToken}`)).resolves.toMatchObject({ id: USER_ID });
  });

  it.each([
    ['no cookie', undefined],
    ['a tampered cookie', 'dm_session=not.a.jwt'],
  ])('works with %s (no session is not an error here)', async (_label, cookie) => {
    const { accountService } = setup();

    const res = await verifyEmail(post(body, { cookie }), noParams);

    expect(res.status).toBe(200);
    expect(accountService.setPasswordFromLink).toHaveBeenCalledWith(body, null);
  });

  it('passes a stale session as no session', async () => {
    const { accountService } = setup();

    await verifyEmail(post(body, { cookie: await session(OTHER_ID, 7) }), noParams);

    expect(accountService.setPasswordFromLink).toHaveBeenCalledWith(body, null);
  });

  it('is 400 VERIFICATION_LINK_INVALID while another account is signed in (L13), with the no-store headers', async () => {
    const { user } = setup();

    const res = await verifyEmail(post(body, { cookie: await session(OTHER_ID, 0) }), noParams);

    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.getSetCookie()).toEqual([]);
    expect(await res.json()).toEqual({
      ok: false,
      error: { code: 'VERIFICATION_LINK_INVALID', message: 'This link is invalid or has expired.' },
    });
    expect(user.sessionVersion).toBe(0);
  });

  it('is 400 VERIFICATION_LINK_INVALID for an expired, used or unknown link', async () => {
    const { accountService } = setup();
    accountService.setPasswordFromLink.mockRejectedValueOnce(new VerificationLinkInvalidError());

    const res = await verifyEmail(post(body), noParams);

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VERIFICATION_LINK_INVALID');
  });

  it('is 400 with field errors for a short password, before the service', async () => {
    const { accountService } = setup();

    const res = await verifyEmail(post({ token: TOKEN, password: 'short' }), noParams);

    expect(res.status).toBe(400);
    expect((await res.json()).error.fieldErrors.password).toEqual(['Password must be at least 12 characters.']);
    expect(accountService.setPasswordFromLink).not.toHaveBeenCalled();
  });

  it('is 503 without SESSION_SECRET, before the link is used', async () => {
    const { accountService } = setup({ SESSION_SECRET: undefined });

    const res = await verifyEmail(post(body), noParams);

    expect(res.status).toBe(503);
    expect(accountService.setPasswordFromLink).not.toHaveBeenCalled();
  });

  it('is 503 when the hashing gate is saturated', async () => {
    const { accountService } = setup();
    accountService.setPasswordFromLink.mockRejectedValueOnce(new ServiceUnavailableError('Busy.'));

    const res = await verifyEmail(post(body), noParams);

    expect(res.status).toBe(503);
  });

  it('is 403 without the CSRF header', async () => {
    const { accountService } = setup();

    const res = await verifyEmail(post(body, { csrf: false }), noParams);

    expect(res.status).toBe(403);
    expect(accountService.setPasswordFromLink).not.toHaveBeenCalled();
  });
});
