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
 * Passes when `user` holds any of `roles`, else `ForbiddenError` (403). Fails closed: no roles
 * listed denies.
 */
export function requireRole(user: Pick<SessionUser, 'roles'>, ...roles: Role[]): void {
  if (!roles.some((role) => user.roles.includes(role))) {
    throw new ForbiddenError();
  }
}
