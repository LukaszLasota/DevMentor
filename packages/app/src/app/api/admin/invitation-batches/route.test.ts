// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Behaviour is tested in core (`invitation-batches.test.ts`, through the real apiHandler) and in
  // `integration/invitation-batches*.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  getInvitationBatches: 'getInvitationBatches',
  openInvitationBatch: 'openInvitationBatch',
  createInvitation: 'createInvitation',
  INVITATION_BATCHES_RESPONSE: 'NO_STORE',
  INVITATION_CREATED_RESPONSE: 'CREATED_NO_STORE',
}));

describe('invitation batch routes', () => {
  it('wire the overview, opening a batch and creating an invitation', async () => {
    const batches = await import('./route');

    expect(batches.GET).toEqual({ handler: 'getInvitationBatches', options: 'NO_STORE' });
    expect(batches.POST).toEqual({ handler: 'openInvitationBatch', options: 'CREATED_NO_STORE' });
    expect((await import('../invitations/route')).POST).toEqual({ handler: 'createInvitation', options: 'CREATED_NO_STORE' });
  });
});
