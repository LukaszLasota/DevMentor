import type { Role } from '@devmentor/db';
import { getSessionUser, type SessionUser, type SessionUserDeps } from '../auth/session-user';
import { ForbiddenError, UnauthorizedError } from './errors';
import { readSessionCookie } from './session-cookie';

/**
 * The signed-in user of a route request, checked live on every call (token, `session_version`,
 * stored roles, operator allowlist). Throws `UnauthorizedError` (401) when there is no valid session.
 */
export async function requireSession(req: Request, cradle: SessionUserDeps): Promise<SessionUser> {
  const user = await getSessionUser(readSessionCookie(req), cradle);

  if (user === null) {
    throw new UnauthorizedError();
  }

  return user;
}

/**
 * Sign-out: with a live session (valid token, current `session_version`) bumps the user's
 * `session_version`, which ends every session of that user on every device. A missing, expired or
 * tampered cookie — or no `SESSION_SECRET` to check it with — changes nothing and does not fail:
 * the route still clears the cookie and answers 200.
 */
export async function endSession(req: Request, cradle: SessionUserDeps): Promise<void> {
  if (cradle.env.SESSION_SECRET === undefined) {
    return;
  }

  const user = await getSessionUser(readSessionCookie(req), cradle);

  if (user !== null) {
    await cradle.accountService.signOut(user.id);
  }
}

/**
 * Passes when `user` holds any of `roles`, else `ForbiddenError` (403). Fails closed: no roles
 * listed denies.
 */
export function requireRole(user: Pick<SessionUser, 'roles'>, ...roles: Role[]): void {
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new ForbiddenError();
  }
}
