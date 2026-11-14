import { User, type Role } from '@devmentor/db';
import type { Cradle } from '../container/cradle';
import { requireSessionSecrets, verifySession } from '../security/session-token';

/** The signed-in user as routes and pages see it (also the `user` DTO of `/api/auth/me`). */
export interface SessionUser {
  id: string;
  email: string;
  /** Effective roles, never empty: stored roles with `operator` derived live from `OPERATOR_EMAILS`. */
  roles: [Role, ...Role[]];
  githubLogin: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export type SessionUserDeps = Pick<Cradle, 'em' | 'env' | 'clock' | 'accountService'>;

/**
 * The shared session check behind `requireSession` (routes) and the page guards: verifies the
 * token (`aud: 'session'`, current or previous secret), loads the user, refuses a missing user or a
 * stale `session_version`, then reconciles the operator role against `OPERATOR_EMAILS`.
 *
 * Returns `null` when there is no valid session. Throws `ServiceUnavailableError` when a cookie is
 * present but `SESSION_SECRET` is missing (fail closed), and a plain `Error` (500, logged) when the
 * stored roles are empty — never a `null`, which would send the user into a sign-in loop.
 */
export async function getSessionUser(
  cookieValue: string | undefined,
  { em, env, clock, accountService }: SessionUserDeps,
): Promise<SessionUser | null> {
  if (cookieValue === undefined || cookieValue === '') {
    return null;
  }

  const claims = await verifySession(cookieValue, requireSessionSecrets(env), clock);

  if (claims === null) {
    return null;
  }

  const user = await em.findOne(User, { id: claims.sub });

  if (user === null || user.sessionVersion !== claims.sv) {
    return null;
  }

  // Checked before reconciling: `normalizeRoles([])` would silently turn an empty set into `mentee`.
  if (user.roles.length === 0) {
    throw new Error(`Stored roles of user ${user.id} are empty`);
  }

  await accountService.reconcileOperator(user);

  return toSessionUser(user);
}

/**
 * The `user` DTO of a user whose roles are effective (reconciled) and non-empty: after the session
 * check above, a password sign-in (`verifyPassword`) or a password set from the link.
 */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    email: user.email,
    // Non-empty: stored sets are checked (DB constraint, check above) and reconciliation never empties them.
    roles: [...user.roles] as SessionUser['roles'],
    githubLogin: user.githubLogin ?? null,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerifiedAt != null,
  };
}
