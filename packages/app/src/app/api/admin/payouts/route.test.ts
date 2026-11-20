// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Behaviour is tested in core (`payouts.test.ts`, through the real apiHandler) and in `integration/mentor-payouts.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  startConnect: 'startConnect',
  refreshConnect: 'refreshConnect',
  releasePayouts: 'releasePayouts',
  resolveReport: 'resolveReport',
  BOOKING_RESPONSE: 'NO_STORE',
}));

describe('payout routes', () => {
  it('wire the mentor Connect routes, the operator release and report resolution, never cached', async () => {
    expect((await import('../../mentors/me/connect/start/route')).POST).toEqual({ handler: 'startConnect', options: 'NO_STORE' });
    expect((await import('../../mentors/me/connect/refresh/route')).POST).toEqual({ handler: 'refreshConnect', options: 'NO_STORE' });
    expect((await import('./release/route')).POST).toEqual({ handler: 'releasePayouts', options: 'NO_STORE' });
    expect((await import('../reports/[id]/resolve/route')).POST).toEqual({ handler: 'resolveReport', options: 'NO_STORE' });
  });
});
