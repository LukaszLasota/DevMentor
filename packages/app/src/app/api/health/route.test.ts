// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

type Handler = (args: { cradle: { healthService: { check: () => Promise<unknown> } } }) => Promise<unknown>;

vi.mock('@devmentor/core/http', () => ({
  // Expose the wrapped handler so the test can call it with a fake cradle.
  apiHandler: (handler: Handler) => handler,
}));

describe('GET /api/health', () => {
  it('delegates to HealthService through apiHandler', async () => {
    const { GET } = await import('./route');
    const check = vi.fn(async () => ({ database: 'up' }));

    await expect((GET as unknown as Handler)({ cradle: { healthService: { check } } })).resolves.toEqual({
      database: 'up',
    });
    expect(check).toHaveBeenCalled();
  });
});
