import { afterEach, describe, expect, it, vi } from 'vitest';
import { signToken } from '../security/jwt';
import type { Clock } from '../time/clock';
import {
  clearOAuthStateCookie,
  OAUTH_STATE_AUDIENCE,
  OAUTH_STATE_TTL_SECONDS,
  oauthStateCookie,
  readOAuthState,
  signOAuthState,
} from './oauth-state-cookie';

const SECRET = 'a'.repeat(64);
const PREVIOUS = 'b'.repeat(64);
const NOW = new Date('2026-10-26T12:00:00.000Z');
const clock: Clock = { now: () => NOW };
const later = (seconds: number): Clock => ({ now: () => new Date(NOW.getTime() + seconds * 1000) });
const STATE = { state: 'state-value', verifier: 'verifier-value', returnTo: '/mentors/42' };

const request = (cookie?: string) =>
  new Request('http://localhost/api/auth/github/callback', cookie === undefined ? {} : { headers: { cookie } });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OAuth state token', () => {
  it('round-trips state, verifier and returnTo through the dm_oauth cookie', async () => {
    const token = await signOAuthState(STATE, SECRET, clock);

    await expect(readOAuthState(request(`theme=dark; dm_oauth=${token}`), { current: SECRET }, clock)).resolves.toEqual(STATE);
  });

  it('omits returnTo when there is none', async () => {
    const token = await signOAuthState({ state: 's', verifier: 'v' }, SECRET, clock);

    await expect(readOAuthState(request(`dm_oauth=${token}`), { current: SECRET }, clock)).resolves.toEqual({
      state: 's',
      verifier: 'v',
    });
  });

  it('accepts a token signed with the previous secret (rotation)', async () => {
    const token = await signOAuthState(STATE, PREVIOUS, clock);

    await expect(
      readOAuthState(request(`dm_oauth=${token}`), { current: SECRET, previous: PREVIOUS }, clock),
    ).resolves.toEqual(STATE);
  });

  it('returns null without the cookie', async () => {
    await expect(readOAuthState(request('dm_session=x'), { current: SECRET }, clock)).resolves.toBeNull();
  });

  it('returns null after 10 minutes', async () => {
    const token = await signOAuthState(STATE, SECRET, clock);

    await expect(
      readOAuthState(request(`dm_oauth=${token}`), { current: SECRET }, later(OAUTH_STATE_TTL_SECONDS - 1)),
    ).resolves.toEqual(STATE);
    await expect(
      readOAuthState(request(`dm_oauth=${token}`), { current: SECRET }, later(OAUTH_STATE_TTL_SECONDS + 1)),
    ).resolves.toBeNull();
  });

  it('returns null for a tampered token or another secret', async () => {
    const token = await signOAuthState(STATE, SECRET, clock);

    await expect(readOAuthState(request(`dm_oauth=${token}x`), { current: SECRET }, clock)).resolves.toBeNull();
    await expect(readOAuthState(request(`dm_oauth=${token}`), { current: PREVIOUS }, clock)).resolves.toBeNull();
  });

  it('returns null for a token of another audience (e.g. a session token)', async () => {
    const token = await signToken({ state: 's', verifier: 'v' }, { audience: 'session', ttlSeconds: 60 }, SECRET, clock);

    await expect(readOAuthState(request(`dm_oauth=${token}`), { current: SECRET }, clock)).resolves.toBeNull();
  });

  it.each([
    ['no state', { verifier: 'v' }],
    ['empty state', { state: '', verifier: 'v' }],
    ['no verifier', { state: 's' }],
    ['empty verifier', { state: 's', verifier: '' }],
    ['non-string returnTo', { state: 's', verifier: 'v', returnTo: 42 }],
  ])('returns null for malformed claims (%s)', async (_label, claims) => {
    const token = await signToken(claims, { audience: OAUTH_STATE_AUDIENCE, ttlSeconds: 60 }, SECRET, clock);

    await expect(readOAuthState(request(`dm_oauth=${token}`), { current: SECRET }, clock)).resolves.toBeNull();
  });
});

describe('OAuth state cookie', () => {
  it('is HttpOnly, SameSite=Lax and lives 10 minutes', () => {
    expect(oauthStateCookie('tok')).toBe('dm_oauth=tok; HttpOnly; SameSite=Lax; Path=/; Max-Age=600');
    expect(OAUTH_STATE_TTL_SECONDS).toBe(600);
  });

  it('is Secure in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(oauthStateCookie('tok')).toContain('; Secure');
  });

  it('is cleared with Max-Age=0', () => {
    expect(clearOAuthStateCookie()).toBe('dm_oauth=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  });
});
