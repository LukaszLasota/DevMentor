import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/db', () => ({ getOrm: vi.fn() }));

describe('public entries', () => {
  it('@devmentor/core exposes the container, env, logger and services', async () => {
    const core = await import('./index');

    expect(Object.keys(core).sort()).toEqual(
      [
        'EventBus',
        'GithubEmailUnverifiedError',
        'GithubOAuthService',
        'HealthService',
        'SESSION_TTL_SECONDS',
        'createRequestScope',
        'getContainer',
        'getEnv',
        'getSessionUser',
        'homeFor',
        'logger',
        'parseEnv',
        'requireSessionSecrets',
        'signSession',
        'systemClock',
        'verifySession',
        'withScope',
      ].sort(),
    );
  });

  it('@devmentor/core/http exposes the API layer', async () => {
    const http = await import('./http/index');

    expect(Object.keys(http).sort()).toEqual(
      [
        'AppError',
        'CSRF_HEADER',
        'CSRF_HEADER_VALUE',
        'ConflictError',
        'DEFAULT_OUTBOUND_TIMEOUT_MS',
        'GITHUB_SIGN_IN_REDIRECT',
        'GithubSignInCancelledError',
        'GithubStateInvalidError',
        'OAUTH_STATE_COOKIE',
        'SESSION_COOKIE',
        'completeGithubSignIn',
        'endSession',
        'startGithubSignIn',
        'clearSessionCookie',
        'createFetchJson',
        'readSessionCookie',
        'requireRole',
        'requireSession',
        'redirectHandler',
        'safeReturnTo',
        'sessionCookie',
        'withCookies',
        'ForbiddenError',
        'NotFoundError',
        'ServiceUnavailableError',
        'UnauthorizedError',
        'ValidationError',
        'apiHandler',
        'makeCrudRoute',
        'parseJsonBody',
        'parseSearchParams',
        'parseWith',
      ].sort(),
    );
  });
});
