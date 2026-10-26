// @vitest-environment node
import type { SessionUser } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  getSessionUser: vi.fn(),
  withScope: vi.fn(),
  cradle: { name: 'cradle' },
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  // The real `homeFor` (pure); the session check and the scope are faked.
  homeFor: (await importOriginal<typeof import('@devmentor/core')>()).homeFor,
  getSessionUser: mocks.getSessionUser,
  withScope: mocks.withScope,
}));
vi.mock('@devmentor/core/http', () => ({ SESSION_COOKIE: 'dm_session' }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === 'dm_session' && mocks.cookieValue !== undefined ? { name, value: mocks.cookieValue } : undefined),
  })),
}));
vi.mock('next/navigation', () => ({
  // Like Next's redirect: throws, so nothing after it runs.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const { getPageSession, requirePageRole, requirePageSession, SESSION_ENDED_REASON } = await import('./session');

function user(roles: SessionUser['roles']): SessionUser {
  return { id: 'user-1', email: 'octo@devmentor.test', roles, githubLogin: null, avatarUrl: null, emailVerified: true };
}

beforeEach(() => {
  mocks.cookieValue = undefined;
  mocks.getSessionUser.mockReset();
  mocks.withScope.mockReset().mockImplementation((fn: (cradle: unknown) => Promise<unknown>) => fn(mocks.cradle));
});

describe('getPageSession', () => {
  it('checks the dm_session cookie in a request scope', async () => {
    mocks.cookieValue = 'tok.en.value';
    mocks.getSessionUser.mockResolvedValueOnce(user(['mentee']));

    await expect(getPageSession()).resolves.toEqual(user(['mentee']));
    expect(mocks.withScope).toHaveBeenCalledTimes(1);
    expect(mocks.getSessionUser).toHaveBeenCalledWith('tok.en.value', mocks.cradle);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
  ])('passes no cookie when it is %s', async (_case, value) => {
    mocks.cookieValue = value;
    mocks.getSessionUser.mockResolvedValueOnce(null);

    await expect(getPageSession()).resolves.toBeNull();
    expect(mocks.getSessionUser).toHaveBeenCalledWith(undefined, mocks.cradle);
  });

  it('lets session check failures through (e.g. empty stored roles → 500)', async () => {
    mocks.cookieValue = 'tok';
    mocks.getSessionUser.mockRejectedValueOnce(new Error('Stored roles of user user-1 are empty'));

    await expect(getPageSession()).rejects.toThrow('Stored roles');
  });
});

describe('requirePageSession', () => {
  it('returns the signed-in user', async () => {
    mocks.cookieValue = 'tok';
    mocks.getSessionUser.mockResolvedValueOnce(user(['mentee']));

    await expect(requirePageSession('/mentors')).resolves.toEqual(user(['mentee']));
  });

  it('redirects to /sign-in with returnTo when there is no cookie', async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);

    await expect(requirePageSession('/mentor/profile?tab=bio')).rejects.toThrow(
      'NEXT_REDIRECT /sign-in?returnTo=%2Fmentor%2Fprofile%3Ftab%3Dbio',
    );
  });

  it('adds reason=session_ended when a cookie was sent but the session is no longer valid', async () => {
    mocks.cookieValue = 'expired.or.revoked';
    mocks.getSessionUser.mockResolvedValueOnce(null);

    expect(SESSION_ENDED_REASON).toBe('session_ended');
    await expect(requirePageSession('/admin')).rejects.toThrow(
      'NEXT_REDIRECT /sign-in?returnTo=%2Fadmin&reason=session_ended',
    );
  });
});

describe('requirePageRole', () => {
  it('returns the user when they hold any listed role', async () => {
    mocks.cookieValue = 'tok';
    mocks.getSessionUser.mockResolvedValueOnce(user(['mentee', 'operator']));

    await expect(requirePageRole('/admin', 'mentor', 'operator')).resolves.toEqual(user(['mentee', 'operator']));
  });

  it('redirects to /sign-in when there is no session', async () => {
    mocks.getSessionUser.mockResolvedValueOnce(null);

    await expect(requirePageRole('/admin', 'operator')).rejects.toThrow('NEXT_REDIRECT /sign-in?returnTo=%2Fadmin');
  });

  it.each([
    ['operator', ['mentee'], '/mentors?notice=operator_only'],
    ['operator', ['mentee', 'mentor'], '/mentor?notice=operator_only'],
    ['mentor', ['mentee'], '/mentors?notice=mentor_only'],
    ['mentor', ['mentee', 'operator'], '/admin?notice=mentor_only'],
    ['mentee', ['operator'], '/admin?notice=mentee_only'],
  ] as const)('without %s, %j goes home to %s', async (role, roles, target) => {
    mocks.cookieValue = 'tok';
    mocks.getSessionUser.mockResolvedValueOnce(user([...roles] as SessionUser['roles']));

    await expect(requirePageRole('/somewhere', role)).rejects.toThrow(`NEXT_REDIRECT ${target}`);
  });
});
