import { SESSION_TTL_SECONDS } from '../security/session-token';
import { authCookie, clearAuthCookie, readCookie } from './cookies';

export const SESSION_COOKIE = 'dm_session';

/** Raw session token from the request, unverified; pass it to `verifySession`. */
export function readSessionCookie(req: Request): string | undefined {
  return readCookie(req, SESSION_COOKIE);
}

export function sessionCookie(token: string): string {
  return authCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_SECONDS });
}

export function clearSessionCookie(): string {
  return clearAuthCookie(SESSION_COOKIE);
}
