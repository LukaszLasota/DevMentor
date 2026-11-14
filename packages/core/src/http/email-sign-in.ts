import { homeFor } from '../auth/home';
import { getSessionUser, toSessionUser, type SessionUser } from '../auth/session-user';
import { clientIp } from '../security/rate-limit';
import { requireSessionSecrets, signSession } from '../security/session-token';
import type { AttemptContext } from '../services/auth/account.service';
import { registerSchema, resendVerificationSchema, setPasswordSchema, signInSchema } from '../validators';
import type { ApiHandlerOptions, HandlerArgs, RouteParams } from './apiHandler';
import { withCookies, type WithCookies } from './apiHandler';
import { parseJsonBody } from './parse';
import { safeReturnTo } from './return-to';
import { readSessionCookie, sessionCookie } from './session-cookie';

// Email registration and password sign-in as `apiHandler` handlers; the app's route files only wire
// them: `export const POST = apiHandler(registerWithEmail, CHECK_INBOX_RESPONSE)`. Behaviour (rate
// limits, mails, hashing gate, link checks) lives in `AccountService`; these parse the body with the
// shared schemas, pass the parsed output on, and issue `dm_session`.

/** Body of register and resend: the same for every email, so it never reveals an account. */
export const CHECK_INBOX = { status: 'check-inbox' } as const;
export type CheckInbox = typeof CHECK_INBOX;

/** `apiHandler` options of register and resend: always 202. */
export const CHECK_INBOX_RESPONSE: ApiHandlerOptions = { successStatus: 202 };

/**
 * `apiHandler` options of verify-email: the token travels in the request body (from the page's URL
 * fragment); neither the answer nor a `Referer` may keep it.
 */
export const VERIFY_EMAIL_RESPONSE: ApiHandlerOptions = {
  headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
};

export interface SignedIn {
  user: SessionUser;
  /** `safeReturnTo(returnTo, homeFor(roles))`: where the page sends the user. */
  redirectTo: string;
}

export type EmailVerified = SignedIn;

function attemptContext({ req, cradle: { env, logger } }: HandlerArgs<RouteParams>): AttemptContext {
  return { ip: clientIp(req.headers, env.TRUSTED_PROXY_HOPS, logger) };
}

/** `POST /api/auth/register` `{ email, returnTo? }` → 202 for every email; 429; 503 on mail failure. */
export async function registerWithEmail(args: HandlerArgs<RouteParams>): Promise<CheckInbox> {
  const input = await parseJsonBody(args.req, registerSchema);
  await args.cradle.accountService.startRegistration(input, attemptContext(args));

  return CHECK_INBOX;
}

/** `POST /api/auth/verify-email/resend` `{ email, returnTo? }` → 202 for every email; 429; 503. */
export async function resendVerificationLink(args: HandlerArgs<RouteParams>): Promise<CheckInbox> {
  const input = await parseJsonBody(args.req, resendVerificationSchema);
  await args.cradle.accountService.resendVerification(input, attemptContext(args));

  return CHECK_INBOX;
}

/**
 * `POST /api/auth/sign-in` `{ email, password, returnTo? }` → `{ user, redirectTo }` + `dm_session` with the current
 * `session_version`; one 401 for every failure; 429; 503 (hashing gate, no `SESSION_SECRET` — checked
 * first so a misconfigured server neither hashes nor counts attempts).
 */
export async function signInWithPassword(args: HandlerArgs<RouteParams>): Promise<WithCookies<SignedIn>> {
  const { req, cradle } = args;
  const secrets = requireSessionSecrets(cradle.env);
  const input = await parseJsonBody(req, signInSchema);
  const { email, password, returnTo } = input;
  const user = await cradle.accountService.verifyPassword({ email, password }, attemptContext(args));
  const session = await signSession({ sub: user.id, sv: user.sessionVersion }, secrets.current, cradle.clock);
  const redirectTo = safeReturnTo(returnTo, homeFor(user.roles));

  return withCookies({ user: toSessionUser(user), redirectTo }, [sessionCookie(session)]);
}

/**
 * `POST /api/auth/verify-email` `{ token, password, returnTo? }`: sets the password from the link and
 * signs the link's account in with a fresh `dm_session` (the bumped `session_version` ends every
 * older session). The live session is read only to refuse a link of another account (L13): no or a
 * dead cookie is not an error here.
 */
export async function verifyEmailAndSetPassword({ req, cradle }: HandlerArgs<RouteParams>): Promise<WithCookies<EmailVerified>> {
  const secrets = requireSessionSecrets(cradle.env);
  const input = await parseJsonBody(req, setPasswordSchema);
  const current = await getSessionUser(readSessionCookie(req), cradle);
  const { user, redirectTo } = await cradle.accountService.setPasswordFromLink(input, current?.id ?? null);
  const session = await signSession({ sub: user.id, sv: user.sessionVersion }, secrets.current, cradle.clock);

  return withCookies({ user: toSessionUser(user), redirectTo }, [sessionCookie(session)]);
}
