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
        'PasswordHasher',
        'REGISTER_RATE_LIMITS',
        'RESEND_RATE_LIMITS',
        'RateLimiter',
        'SESSION_TTL_SECONDS',
        'SIGN_IN_RATE_LIMITS',
        'clientIp',
        'guardPasswordAttempt',
        'rateLimitChecks',
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
        'isAppError',
        'isTooManyRequestsError',
        'isValidationError',
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
        'TooManyRequestsError',
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
