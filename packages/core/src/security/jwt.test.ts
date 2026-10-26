import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Clock } from '../time/clock';
import { signToken, verifyToken } from './jwt';

const SECRET = 'a'.repeat(64);
const OTHER_SECRET = 'b'.repeat(64);
const NOW = new Date('2026-10-26T12:00:00Z');
const clock: Clock = { now: () => NOW };
const OPTIONS = { audience: 'oauth-state', ttlSeconds: 600 };

describe('signToken / verifyToken', () => {
  it('round-trips claims with aud, iat and exp from the clock', async () => {
    const token = await signToken({ state: 's1' }, OPTIONS, SECRET, clock);

    const payload = await verifyToken(token, 'oauth-state', [SECRET], clock);

    expect(payload).toEqual({
      state: 's1',
      aud: 'oauth-state',
      iat: NOW.getTime() / 1000,
      exp: NOW.getTime() / 1000 + 600,
    });
  });

  it('tries the secrets in order', async () => {
    const token = await signToken({}, OPTIONS, OTHER_SECRET, clock);

    expect(await verifyToken(token, 'oauth-state', [SECRET, OTHER_SECRET], clock)).not.toBeNull();
    expect(await verifyToken(token, 'oauth-state', [SECRET], clock)).toBeNull();
  });

  it('refuses another audience and HS256 tokens without one', async () => {
    const token = await signToken({}, OPTIONS, SECRET, clock);
    const noAudience = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode(SECRET));

    expect(await verifyToken(token, 'session', [SECRET], clock)).toBeNull();
    expect(await verifyToken(noAudience, 'oauth-state', [SECRET], clock)).toBeNull();
  });

  it('returns null without any secret', async () => {
    const token = await signToken({}, OPTIONS, SECRET, clock);

    expect(await verifyToken(token, 'oauth-state', [], clock)).toBeNull();
  });
});
