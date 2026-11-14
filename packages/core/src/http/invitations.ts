import type { Role } from '@devmentor/db';
import { requireSessionSecrets, signSession } from '../security/session-token';
import type { InvitationLookup } from '../services/invitations/invitation.service';
import type { ApiHandlerOptions, HandlerArgs } from './apiHandler';
import { withCookies, type WithCookies } from './apiHandler';
import { requireSession } from './auth';
import { sessionCookie } from './session-cookie';

// Mentor invitation routes as `apiHandler` handlers (spec 2026-10-21-mentor-invitations, API
// Contracts); the app's route files only wire them. The token travels in the path: the service
// checks its format (`linkTokenField`) before hashing, and the logger redacts it (`redactPath`).

/** Where an accepted invitation sends the new mentor. */
export const MENTOR_HOME = '/mentor';

/** `apiHandler` options of both invitation routes: the token is in the URL, so nothing may keep the answer or a `Referer`. */
export const INVITATION_RESPONSE: ApiHandlerOptions = {
  headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
};

/** Route params of `/api/invitations/[token]/…` (a type, not an interface: it must fit `RouteParams`). */
export type InvitationTokenParams = { token: string };

export interface InvitationAccepted {
  roles: Role[];
  /** ISO 8601 instant: "Publish at least one bookable session by <date>". */
  publishDueAt: string;
  redirect: typeof MENTOR_HOME;
}

/** `GET /api/invitations/[token]` (public) → `{ email, stackTags }`; 404 with one message for every invalid token. */
export async function lookupInvitation({ params, cradle }: HandlerArgs<InvitationTokenParams>): Promise<InvitationLookup> {
  return cradle.invitationService.lookup(params.token);
}

/**
 * `POST /api/invitations/[token]/accept` (signed in) → `{ roles, publishDueAt, redirect }` and a
 * re-issued `dm_session` signed with the user's `session_version` after the commit (`grantRole`
 * bumped it; without the new cookie the caller's own acceptance would sign them out). Re-issued on
 * every 200, also when nothing changed. Errors: 401, 404, 409 `ALREADY_MENTOR`, 403 (service order).
 */
export async function acceptInvitation({
  req,
  params,
  cradle,
}: HandlerArgs<InvitationTokenParams>): Promise<WithCookies<InvitationAccepted>> {
  const secrets = requireSessionSecrets(cradle.env);
  const user = await requireSession(req, cradle);
  const { roles, publishDueAt, sessionVersion } = await cradle.invitationService.accept(params.token, user);
  const session = await signSession({ sub: user.id, sv: sessionVersion }, secrets.current, cradle.clock);

  return withCookies({ roles, publishDueAt: publishDueAt.toISOString(), redirect: MENTOR_HOME }, [sessionCookie(session)]);
}
