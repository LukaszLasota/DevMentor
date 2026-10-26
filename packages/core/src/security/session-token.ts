import type { Env } from '../config/env';
import { ServiceUnavailableError } from '../http/errors';
import type { Clock } from '../time/clock';
import { signToken, verifyToken } from './jwt';

export const SESSION_AUDIENCE = 'session';
/** Sessions last 24 h with no refresh; the cookie's Max-Age uses the same value. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

/** Claims of the session JWT: user id and the user's session version. Roles are never in the token. */
export interface SessionClaims {
  sub: string;
  sv: number;
}

/** `current` signs and verifies; `previous` (after a rotation) only verifies. */
export interface SessionSecrets {
  current: string;
  previous?: string;
}

/**
 * Session secrets for auth routes. Production refuses to boot without SESSION_SECRET
 * (`assertProductionEnv`); elsewhere a missing secret makes auth routes fail closed with a 503.
 */
export function requireSessionSecrets(env: Pick<Env, 'SESSION_SECRET' | 'SESSION_SECRET_PREVIOUS'>): SessionSecrets {
  if (env.SESSION_SECRET === undefined) {
    throw new ServiceUnavailableError('Sign-in is not configured.');
  }

  return { current: env.SESSION_SECRET, previous: env.SESSION_SECRET_PREVIOUS };
}

/** Secrets a verifier tries in order: current, then previous (verify only). */
export function verificationKeys({ current, previous }: SessionSecrets): string[] {
  return previous === undefined ? [current] : [current, previous];
}

export function signSession({ sub, sv }: SessionClaims, secret: string, clock: Clock): Promise<string> {
  return signToken({ sub, sv }, { audience: SESSION_AUDIENCE, ttlSeconds: SESSION_TTL_SECONDS }, secret, clock);
}

/** Verified session claims, or `null` for any invalid, expired or foreign token. */
export async function verifySession(token: string, secrets: SessionSecrets, clock: Clock): Promise<SessionClaims | null> {
  const payload = await verifyToken(token, SESSION_AUDIENCE, verificationKeys(secrets), clock);
  const { sub, sv } = payload ?? {};

  if (typeof sub !== 'string' || sub === '' || typeof sv !== 'number' || !Number.isSafeInteger(sv) || sv < 0) {
    return null;
  }

  return { sub, sv };
}
