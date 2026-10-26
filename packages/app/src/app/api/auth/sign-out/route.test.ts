// @vitest-environment node
import { parseEnv, signSession, type Clock } from '@devmentor/core';
import { UnauthorizedError } from '@devmentor/core/http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (args: { req: Request; cradle: unknown }) => Promise<unknown>;

vi.mock('@devmentor/core/http', async (importOriginal) => ({
  // Real session check and sign-out (`endSession`, `requireSession`); the wrapper only exposes the
  // handler, and `withCookies` keeps its cookies readable. CSRF and envelope: apiHandler tests.
  ...(await importOriginal<typeof import('@devmentor/core/http')>()),
  apiHandler: (handler: Handler) => handler,
  withCookies: (data: unknown, cookies: readonly string[]) => ({ data, cookies }),
}));

const { POST: signOut } = await import('./route');
const { GET: me } = await import('../me/route');

const SECRET = 'a'.repeat(64);
const clock: Clock = { now: () => new Date('2026-10-26T12:00:00.000Z') };
const USER_ID = '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f';
const CLEARED_SESSION = 'dm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

function setup(sessionSecret: string | undefined = SECRET) {
  const user = {
    id: USER_ID,
    email: 'octo@devmentor.test',
    roles: ['mentee'],
    sessionVersion: 0,
    githubLogin: 'octo-cat',
    avatarUrl: null,
    emailVerifiedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const accountService = {
    reconcileOperator: vi.fn(async (u: unknown) => u),
    signOut: vi.fn(async (id: string) => {
      if (id === user.id) {
        user.sessionVersion += 1;
      }
    }),
  };
  const cradle = {
    em: { findOne: vi.fn(async (_entity: unknown, where: { id: string }) => (where.id === user.id ? user : null)) },
    env: parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', SESSION_SECRET: sessionSecret }),
    clock,
    accountService,
  };

  return { cradle, user, accountService };
}

const request = (method: string, path: string, cookie?: string) =>
  new Request(`http://localhost${path}`, { method, headers: cookie === undefined ? {} : { cookie } });

const call = (handler: unknown, req: Request, cradle: unknown) => (handler as Handler)({ req, cradle });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/auth/sign-out', () => {
  it('bumps session_version so the old token is refused by /me afterwards (global logout)', async () => {
    const { cradle, user, accountService } = setup();
    const cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

    await expect(call(me, request('GET', '/api/auth/me', cookie), cradle)).resolves.toEqual({
      user: expect.objectContaining({ id: USER_ID }),
    });

    await expect(call(signOut, request('POST', '/api/auth/sign-out', cookie), cradle)).resolves.toEqual({
      data: null,
      cookies: [CLEARED_SESSION],
    });
    expect(accountService.signOut).toHaveBeenCalledWith(USER_ID);
    expect(user.sessionVersion).toBe(1);

    await expect(call(me, request('GET', '/api/auth/me', cookie), cradle)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([
    ['no cookie', undefined],
    ['a tampered cookie', 'dm_session=not.a.jwt'],
  ])('clears the cookie and succeeds with %s, without a bump', async (_label, cookie) => {
    const { cradle, user, accountService } = setup();

    await expect(call(signOut, request('POST', '/api/auth/sign-out', cookie), cradle)).resolves.toEqual({
      data: null,
      cookies: [CLEARED_SESSION],
    });
    expect(accountService.signOut).not.toHaveBeenCalled();
    expect(user.sessionVersion).toBe(0);
  });

  it('does not bump for a stale token (an older session of the user)', async () => {
    const { cradle, user, accountService } = setup();
    user.sessionVersion = 2;
    const cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 1 }, SECRET, clock)}`;

    await expect(call(signOut, request('POST', '/api/auth/sign-out', cookie), cradle)).resolves.toMatchObject({
      cookies: [CLEARED_SESSION],
    });
    expect(accountService.signOut).not.toHaveBeenCalled();
  });

  it('clears the cookie without SESSION_SECRET', async () => {
    const { cradle } = setup(undefined);

    await expect(call(signOut, request('POST', '/api/auth/sign-out', 'dm_session=x.y.z'), cradle)).resolves.toMatchObject({
      cookies: [CLEARED_SESSION],
    });
  });
});

describe('GET /api/auth/me', () => {
  it('returns the session user DTO', async () => {
    const { cradle } = setup();
    const cookie = `dm_session=${await signSession({ sub: USER_ID, sv: 0 }, SECRET, clock)}`;

    await expect(call(me, request('GET', '/api/auth/me', cookie), cradle)).resolves.toEqual({
      user: {
        id: USER_ID,
        email: 'octo@devmentor.test',
        roles: ['mentee'],
        githubLogin: 'octo-cat',
        avatarUrl: null,
        emailVerified: true,
      },
    });
  });

  it('is 401 without a session', async () => {
    const { cradle } = setup();

    await expect(call(me, request('GET', '/api/auth/me'), cradle)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
