// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the routes wire; the behaviour is tested in core (`http/invitations.test.ts`, through
  // the real apiHandler) and over HTTP in `integration/invitation-routes.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  lookupInvitation: 'lookupInvitation',
  acceptInvitation: 'acceptInvitation',
  INVITATION_RESPONSE: 'INVITATION_RESPONSE',
}));

describe('invitation routes', () => {
  it('GET /api/invitations/[token] wires the lookup with no-store headers', async () => {
    const { GET } = await import('./route');

    expect(GET).toEqual({ handler: 'lookupInvitation', options: 'INVITATION_RESPONSE' });
  });

  it('POST /api/invitations/[token]/accept wires the accept with no-store headers', async () => {
    const { POST } = await import('./accept/route');

    expect(POST).toEqual({ handler: 'acceptInvitation', options: 'INVITATION_RESPONSE' });
  });
});
