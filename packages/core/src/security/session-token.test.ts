import { SignJWT, type JWTPayload } from 'jose';
import { describe, expect, it } from 'vitest';
import { ServiceUnavailableError } from '../http/errors';
import type { Clock } from '../time/clock';
import { signToken } from './jwt';
import { requireSessionSecrets, SESSION_TTL_SECONDS, signSession, verifySession } from './session-token';

const SECRET = 'a'.repeat(64);
const PREVIOUS = 'b'.repeat(64);
const NOW = new Date('2026-10-26T12:00:00Z');
const clock: Clock = { now: () => NOW };
const at = (offsetSeconds: number): Clock => ({ now: () => new Date(NOW.getTime() + offsetSeconds * 1000) });
const claims = { sub: '0b5c3f9e-1d2a-4b6c-8e7f-9a0b1c2d3e4f', sv: 3 };
const key = (secret: string) => new TextEncoder().encode(secret);

function base64url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('requireSessionSecrets', () => {
  it('returns the current and previous secret', () => {
    expect(requireSessionSecrets({ SESSION_SECRET: SECRET, SESSION_SECRET_PREVIOUS: PREVIOUS })).toEqual({
      current: SECRET,
      previous: PREVIOUS,
    });
  });

  it('fails closed with a 503 when SESSION_SECRET is missing', () => {
    expect(() => requireSessionSecrets({ SESSION_SECRET: undefined, SESSION_SECRET_PREVIOUS: PREVIOUS })).toThrow(
      ServiceUnavailableError,
    );
  });
});

describe('signSession / verifySession', () => {
  it('round-trips sub and sv', async () => {
    const token = await signSession(claims, SECRET, clock);

    expect(await verifySession(token, { current: SECRET }, clock)).toEqual(claims);
  });

  it('signs HS256 with aud "session" and a 24 h expiry, without roles', async () => {
    const token = await signSession(claims, SECRET, clock);
    const [header, payload] = token.split('.').slice(0, 2).map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));

    expect(header).toEqual({ alg: 'HS256' });
    expect(payload).toEqual({
      ...claims,
      aud: 'session',
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + SESSION_TTL_SECONDS,
    });
  });

  it('accepts a token signed with the previous secret (verify only)', async () => {
    const token = await signSession(claims, PREVIOUS, clock);

    expect(await verifySession(token, { current: SECRET, previous: PREVIOUS }, clock)).toEqual(claims);
    expect(await verifySession(token, { current: SECRET }, clock)).toBeNull();
  });

  it('refuses a token signed with an unknown secret', async () => {
    const token = await signSession(claims, 'c'.repeat(64), clock);

    expect(await verifySession(token, { current: SECRET, previous: PREVIOUS }, clock)).toBeNull();
  });

  it('refuses a tampered payload', async () => {
    const [header, , signature] = (await signSession(claims, SECRET, clock)).split('.');
    const forged = [header, base64url({ ...claims, sub: 'someone-else', aud: 'session' }), signature].join('.');

    expect(await verifySession(forged, { current: SECRET }, clock)).toBeNull();
  });

  it('refuses alg "none" and other algorithms', async () => {
    const none = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ ...claims, aud: 'session' })}.`;
    const hs512 = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS512' })
      .setAudience('session')
      .setExpirationTime(NOW.getTime() / 1000 + 60)
      .sign(key(SECRET));

    expect(await verifySession(none, { current: SECRET }, clock)).toBeNull();
    expect(await verifySession(hs512, { current: SECRET }, clock)).toBeNull();
  });

  it('refuses a token for another audience', async () => {
    const token = await signToken(claims, { audience: 'oauth-state', ttlSeconds: 600 }, SECRET, clock);

    expect(await verifySession(token, { current: SECRET }, clock)).toBeNull();
  });

  it('refuses an expired token, judged by the injected clock', async () => {
    const token = await signSession(claims, SECRET, clock);

    expect(await verifySession(token, { current: SECRET }, at(SESSION_TTL_SECONDS - 1))).toEqual(claims);
    expect(await verifySession(token, { current: SECRET }, at(SESSION_TTL_SECONDS + 1))).toBeNull();
  });

  it('refuses malformed tokens', async () => {
    for (const token of ['', 'not-a-jwt', 'a.b.c', `${base64url({ alg: 'HS256' })}.%%%.sig`]) {
      expect(await verifySession(token, { current: SECRET }, clock)).toBeNull();
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ['missing sub', { sv: 1 }],
    ['empty sub', { sub: '', sv: 1 }],
    ['non-string sub', { sub: 42, sv: 1 }],
    ['missing sv', { sub: 'u1' }],
    ['non-numeric sv', { sub: 'u1', sv: '1' }],
    ['fractional sv', { sub: 'u1', sv: 1.5 }],
    ['negative sv', { sub: 'u1', sv: -1 }],
  ])('refuses a validly signed token with %s', async (_label, payload) => {
    const token = await signToken(payload as JWTPayload, { audience: 'session', ttlSeconds: 60 }, SECRET, clock);

    expect(await verifySession(token, { current: SECRET }, clock)).toBeNull();
  });
});
