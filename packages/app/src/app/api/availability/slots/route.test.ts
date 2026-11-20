// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the routes wire; the behaviour is tested in core (`http/availability.test.ts`, through
  // the real apiHandler) and over HTTP in `integration/availability-slots.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  listMySlots: 'listMySlots',
  publishSlot: 'publishSlot',
  removeSlot: 'removeSlot',
  MENTOR_OWNER_RESPONSE: 'MENTOR_OWNER_RESPONSE',
}));

describe('slot routes', () => {
  it('/api/availability/slots wires GET and POST with no-store headers', async () => {
    const { GET, POST } = await import('./route');

    expect(GET).toEqual({ handler: 'listMySlots', options: 'MENTOR_OWNER_RESPONSE' });
    expect(POST).toEqual({ handler: 'publishSlot', options: 'MENTOR_OWNER_RESPONSE' });
  });

  it('/api/availability/slots/[id] wires DELETE with no-store headers', async () => {
    const { DELETE } = await import('./[id]/route');

    expect(DELETE).toEqual({ handler: 'removeSlot', options: 'MENTOR_OWNER_RESPONSE' });
  });
});
