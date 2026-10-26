import 'server-only';
import { getSessionUser, withScope, type Role, type SessionUser } from '@devmentor/core';
import { SESSION_COOKIE } from '@devmentor/core/http';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

// Page guards over the shared session check (`getSessionUser`), the same live check routes run.
// Every guarded layout AND every guarded page.tsx calls one of them: a layout does not re-run on
// client navigation. Pages reading the session render at request time, so the calling component
// sits inside <Suspense> (cacheComponents).
//
// Server components cannot read the current pathname in Next 16 (layouts do not re-render on
// navigation; `usePathname` is client-only), so each caller passes its own path — static for a
// fixed route, built from `params`/`searchParams` for a dynamic one. It is only used as `returnTo`,
// which `/sign-in` re-validates with `safeReturnTo`.

/** `/sign-in?reason=` value when a session cookie was sent but no longer verifies. */
export const SESSION_ENDED_REASON = 'session_ended';

/** `?notice=` value on `homeFor(roles)` after a role page refused the user. */
export type RoleNotice = `${Role}_only`;

/** Where a user lands by default: operator → `/admin`, then mentor → `/mentor`, else `/mentors` (L01). */
export function homeFor(roles: readonly Role[]): string {
  if (roles.includes('operator')) {
    return '/admin';
  }

  if (roles.includes('mentor')) {
    return '/mentor';
  }

  return '/mentors';
}

interface PageSession {
  user: SessionUser | null;
  /** A session cookie was sent (valid or not). */
  hadCookie: boolean;
}

async function readPageSession(): Promise<PageSession> {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value || undefined;
  const user = await withScope((cradle) => getSessionUser(cookie, cradle));

  return { user, hadCookie: cookie !== undefined };
}

/** The signed-in user, or `null`; never redirects (e.g. `/sign-in` sending a signed-in user home). */
export async function getPageSession(): Promise<SessionUser | null> {
  return (await readPageSession()).user;
}

/**
 * The signed-in user, else a redirect to `/sign-in?returnTo=<currentPath>`, with
 * `reason=session_ended` when a cookie was sent but the session expired or was revoked (L03).
 */
export async function requirePageSession(currentPath: string): Promise<SessionUser> {
  const { user, hadCookie } = await readPageSession();

  if (user === null) {
    const query = new URLSearchParams({ returnTo: currentPath });

    if (hadCookie) {
      query.set('reason', SESSION_ENDED_REASON);
    }

    redirect(`/sign-in?${query.toString()}`);
  }

  return user;
}

/**
 * The signed-in user holding any of `roles`. Without a session → as `requirePageSession`; without
 * the role → `homeFor(user.roles)?notice=<first role>_only` so that page can say e.g. "This page is
 * for mentors." (L03).
 */
export async function requirePageRole(currentPath: string, ...roles: [Role, ...Role[]]): Promise<SessionUser> {
  const user = await requirePageSession(currentPath);

  if (!roles.some((role) => user.roles.includes(role))) {
    const notice: RoleNotice = `${roles[0]}_only`;

    redirect(`${homeFor(user.roles)}?${new URLSearchParams({ notice }).toString()}`);
  }

  return user;
}
