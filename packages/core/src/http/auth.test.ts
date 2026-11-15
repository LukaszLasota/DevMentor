import { describe, expect, it, vi } from 'vitest';
import type { SessionUser, SessionUserDeps } from '../auth/session-user';
import { endSession, requireRole, requireSession } from './auth';
import { ForbiddenError, UnauthorizedError } from './errors';

const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock('../auth/session-user', () => ({ getSessionUser }));

const USER: SessionUser = {
  id: 'user-1',
  email: 'octo@devmentor.test',
  roles: ['mentee', 'mentor'],
  githubLogin: 'octo-cat',
  avatarUrl: null,
  emailVerified: true,
};
const cradle = {} as SessionUserDeps;

const request = (cookie?: string) =>
  new Request('http://localhost/api/auth/me', cookie === undefined ? {} : { headers: { cookie } });

describe('requireSession', () => {
  it('returns the session user read from the dm_session cookie', async () => {
    getSessionUser.mockResolvedValueOnce(USER);

    await expect(requireSession(request('theme=dark; dm_session=tok.en.value'), cradle)).resolves.toBe(USER);
    expect(getSessionUser).toHaveBeenLastCalledWith('tok.en.value', cradle);
  });

  it('throws UnauthorizedError (401) when there is no valid session', async () => {
    getSessionUser.mockResolvedValueOnce(null);

    await expect(requireSession(request(), cradle)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(getSessionUser).toHaveBeenLastCalledWith(undefined, cradle);
  });

  it('lets session check failures through instead of treating them as signed out', async () => {
    getSessionUser.mockRejectedValueOnce(new Error('Stored roles of user user-1 are empty'));

    await expect(requireSession(request('dm_session=x'), cradle)).rejects.toThrow('Stored roles');
  });
});

describe('requireRole', () => {
  it('passes when the user holds any listed role', () => {
    expect(() => requireRole(USER, 'operator', 'mentor')).not.toThrow();
    expect(() => requireRole(USER, 'mentee')).not.toThrow();
  });

  it('throws ForbiddenError (403) when the user holds none of them', () => {
    expect(() => requireRole(USER, 'operator')).toThrow(ForbiddenError);
  });

  it('fails closed when no role is listed', () => {
    expect(() => requireRole(USER)).toThrow(ForbiddenError);
  });
});

describe('endSession', () => {
  const deps = (sessionSecret?: string) => {
    const signOut = vi.fn(async () => undefined);
    const env = { SESSION_SECRET: sessionSecret } as SessionUserDeps['env'];

    return { signOut, cradle: { env, accountService: { signOut } } as unknown as SessionUserDeps };
  };

  it('bumps the session version of a live session', async () => {
    const { signOut, cradle: live } = deps('a'.repeat(64));
    getSessionUser.mockResolvedValueOnce(USER);

    await endSession(request('dm_session=tok.en.value'), live);

    expect(getSessionUser).toHaveBeenLastCalledWith('tok.en.value', live);
    expect(signOut).toHaveBeenCalledWith('user-1');
  });

  it('changes nothing for a missing, expired or tampered cookie', async () => {
    const { signOut, cradle: dead } = deps('a'.repeat(64));
    getSessionUser.mockResolvedValueOnce(null);

    await expect(endSession(request('dm_session=tampered'), dead)).resolves.toBeUndefined();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('does not fail without SESSION_SECRET (nothing to verify the cookie with)', async () => {
    const { signOut, cradle: unconfigured } = deps();
    getSessionUser.mockClear();

    await expect(endSession(request('dm_session=tok.en.value'), unconfigured)).resolves.toBeUndefined();
    expect(getSessionUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
