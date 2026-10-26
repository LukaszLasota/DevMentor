import { timingSafeEqual } from 'node:crypto';
import { homeFor } from '../auth/home';
import { createPkceVerifier, pkceChallenge } from '../security/pkce';
import { requireSessionSecrets, signSession } from '../security/session-token';
import { hashToken, randomToken } from '../security/token';
import type { HandlerArgs, RouteParams } from './apiHandler';
import { AppError, ServiceUnavailableError } from './errors';
import { clearOAuthStateCookie, oauthStateCookie, readOAuthState, signOAuthState } from './oauth-state-cookie';
import type { ExternalRedirect, InternalRedirect, RedirectHandlerOptions } from './redirectHandler';
import { safeReturnTo } from './return-to';
import { sessionCookie } from './session-cookie';

// GitHub sign-in (start + callback) as `redirectHandler` handlers; the app's route files only wire
// them: `export const GET = redirectHandler(startGithubSignIn, GITHUB_SIGN_IN_REDIRECT)`.
// Every failure lands on `/sign-in?error=<code>` and clears `dm_oauth`. Codes the page maps:
// `github_unavailable`, `github_cancelled`, `github_state_invalid`, `github_email_unverified`,
// `github_account_conflict`, `unexpected`.

/** The user pressed Cancel on GitHub's consent screen (`?error=access_denied`). */
export class GithubSignInCancelledError extends AppError {
  constructor(message = 'GitHub sign-in was cancelled.', options?: ErrorOptions) {
    super(400, 'GITHUB_CANCELLED', message, options);
  }
}

/**
 * The callback's `state` does not match a valid `dm_oauth` cookie: missing or expired cookie
 * (more than 10 minutes on GitHub, another browser), a tampered cookie or a forged callback (CSRF).
 */
export class GithubStateInvalidError extends AppError {
  constructor(message = 'The GitHub sign-in link is invalid or has expired.', options?: ErrorOptions) {
    super(400, 'GITHUB_STATE_INVALID', message, options);
  }
}

/** `redirectHandler` options shared by both GitHub routes. */
export const GITHUB_SIGN_IN_REDIRECT: RedirectHandlerOptions = {
  errorRedirect: '/sign-in',
  // Missing configuration, GitHub errors, timeouts: one message for the user.
  errorCodes: { SERVICE_UNAVAILABLE: 'github_unavailable' },
  errorCookies: [clearOAuthStateCookie()],
};

// GitHub's own cancel value on the callback (`?error=access_denied`).
const GITHUB_ACCESS_DENIED = 'access_denied';

/** Constant-time comparison; hashing first gives both sides the same length. */
function sameState(a: string, b: string): boolean {
  return timingSafeEqual(Buffer.from(hashToken(a)), Buffer.from(hashToken(b)));
}

/**
 * `GET /api/auth/github?returnTo=&login=`: stores state, PKCE verifier and the safe `returnTo` in
 * `dm_oauth` and redirects to GitHub. Missing `SESSION_SECRET` or GitHub configuration → 503
 * (`github_unavailable`).
 */
export async function startGithubSignIn({
  req,
  cradle: { env, clock, githubOAuthService },
}: HandlerArgs<RouteParams>): Promise<ExternalRedirect> {
  const secrets = requireSessionSecrets(env);
  const query = new URL(req.url).searchParams;
  const state = randomToken();
  const verifier = createPkceVerifier();
  const externalLocation = githubOAuthService.buildAuthorizeUrl({
    state,
    codeChallenge: pkceChallenge(verifier),
    login: query.get('login') ?? undefined,
  });
  // Unsafe or absent → no returnTo; the callback then sends the user home.
  const returnTo = safeReturnTo(query.get('returnTo'), '') || undefined;
  const token = await signOAuthState({ state, verifier, returnTo }, secrets.current, clock);

  return { externalLocation, cookies: [oauthStateCookie(token)] };
}

/**
 * `GET /api/auth/github/callback?code&state`: checks `state` against the verified `dm_oauth` cookie
 * before any outbound call, exchanges the code, resolves the account, signs the session and lands on
 * `safeReturnTo(returnTo, homeFor(roles))`.
 */
export async function completeGithubSignIn({
  req,
  cradle: { env, clock, logger, githubOAuthService, accountService },
}: HandlerArgs<RouteParams>): Promise<InternalRedirect> {
  const query = new URL(req.url).searchParams;
  const githubError = query.get('error');

  if (githubError === GITHUB_ACCESS_DENIED) {
    throw new GithubSignInCancelledError();
  }

  const secrets = requireSessionSecrets(env);
  const oauthState = await readOAuthState(req, secrets, clock);
  const state = query.get('state');

  if (oauthState === null || state === null || !sameState(state, oauthState.state)) {
    throw new GithubStateInvalidError();
  }

  const code = query.get('code');

  if (githubError !== null || code === null || code === '') {
    // GitHub's error identifiers (e.g. `redirect_uri_mismatch`) are a fixed set, safe to log.
    logger.warn({ githubError: githubError ?? 'missing_code' }, 'GitHub callback without a code');
    throw new ServiceUnavailableError('GitHub sign-in failed.');
  }

  const accessToken = await githubOAuthService.exchangeCode({ code, codeVerifier: oauthState.verifier });
  const profile = await githubOAuthService.fetchProfile(accessToken);
  const user = await accountService.resolveGithubAccount(profile);
  const session = await signSession({ sub: user.id, sv: user.sessionVersion }, secrets.current, clock);

  return {
    location: safeReturnTo(oauthState.returnTo, homeFor(user.roles)),
    cookies: [sessionCookie(session), clearOAuthStateCookie()],
  };
}
