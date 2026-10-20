import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/db', () => ({ getOrm: vi.fn() }));

describe('public entries', () => {
  it('@devmentor/core exposes the container, env, logger and services', async () => {
    const core = await import('./index');

    expect(Object.keys(core).sort()).toEqual(
      ['HealthService', 'createRequestScope', 'getContainer', 'getEnv', 'logger', 'parseEnv', 'withScope'].sort(),
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
