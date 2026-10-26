import { signToken, verifyToken } from '../security/jwt';
import { verificationKeys, type SessionSecrets } from '../security/session-token';
import type { Clock } from '../time/clock';
import { authCookie, clearAuthCookie, readCookie } from './cookies';

// Short-lived cookie binding a GitHub OAuth round trip to the browser that started it:
// a signed JWT (`aud: 'oauth-state'`, same secrets as the session) carrying the `state` sent to
// GitHub, the PKCE verifier (never leaves the server otherwise) and the validated `returnTo`.
// SameSite=Lax, so GitHub's top-level redirect to the callback still sends it.

export const OAUTH_STATE_COOKIE = 'dm_oauth';
export const OAUTH_STATE_AUDIENCE = 'oauth-state';
/** The user has 10 minutes to finish on GitHub; the cookie and the token expire together. */
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface OAuthState {
  /** Random value sent to GitHub as `state`; the callback's `?state` must equal it. */
  state: string;
  /** PKCE code verifier for the token exchange. */
  verifier: string;
  /** Safe in-app path to land on after sign-in; `undefined` → the user's home. */
  returnTo?: string;
}

/** Signs `oauthState` with the current session secret. */
export function signOAuthState({ state, verifier, returnTo }: OAuthState, secret: string, clock: Clock): Promise<string> {
  return signToken(
    { state, verifier, ...(returnTo === undefined ? {} : { returnTo }) },
    { audience: OAUTH_STATE_AUDIENCE, ttlSeconds: OAUTH_STATE_TTL_SECONDS },
    secret,
    clock,
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/**
 * The verified OAuth state from the request's `dm_oauth` cookie (current or previous secret), or
 * `null` when the cookie is missing, expired, tampered, signed for another audience or malformed.
 */
export async function readOAuthState(req: Request, secrets: SessionSecrets, clock: Clock): Promise<OAuthState | null> {
  const token = readCookie(req, OAUTH_STATE_COOKIE);

  if (token === undefined) {
    return null;
  }

  const payload = await verifyToken(token, OAUTH_STATE_AUDIENCE, verificationKeys(secrets), clock);
  const { state, verifier, returnTo } = payload ?? {};

  if (!nonEmptyString(state) || !nonEmptyString(verifier) || !(returnTo === undefined || typeof returnTo === 'string')) {
    return null;
  }

  return { state, verifier, ...(returnTo === undefined ? {} : { returnTo }) };
}

export function oauthStateCookie(token: string): string {
  return authCookie(OAUTH_STATE_COOKIE, token, { maxAgeSeconds: OAUTH_STATE_TTL_SECONDS });
}

export function clearOAuthStateCookie(): string {
  return clearAuthCookie(OAUTH_STATE_COOKIE);
}
