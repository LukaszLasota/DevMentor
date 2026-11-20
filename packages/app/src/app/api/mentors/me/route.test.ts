// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the routes wire; the behaviour is tested in core (`http/mentors.test.ts`, through the
  // real apiHandler) and over HTTP in `integration/mentor-page.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  getOwnMentorPage: 'getOwnMentorPage',
  updateOwnMentorPage: 'updateOwnMentorPage',
  publishOwnMentorPage: 'publishOwnMentorPage',
  unpublishOwnMentorPage: 'unpublishOwnMentorPage',
  getPublicMentorPage: 'getPublicMentorPage',
  MENTOR_OWNER_RESPONSE: 'MENTOR_OWNER_RESPONSE',
}));

describe('mentor page routes', () => {
  it('/api/mentors/me wires GET and PUT with no-store headers', async () => {
    const { GET, PUT } = await import('./route');

    expect(GET).toEqual({ handler: 'getOwnMentorPage', options: 'MENTOR_OWNER_RESPONSE' });
    expect(PUT).toEqual({ handler: 'updateOwnMentorPage', options: 'MENTOR_OWNER_RESPONSE' });
  });

  it('/api/mentors/me/publish and /unpublish wire POST with no-store headers', async () => {
    const { POST: publish } = await import('./publish/route');
    const { POST: unpublish } = await import('./unpublish/route');

    expect(publish).toEqual({ handler: 'publishOwnMentorPage', options: 'MENTOR_OWNER_RESPONSE' });
    expect(unpublish).toEqual({ handler: 'unpublishOwnMentorPage', options: 'MENTOR_OWNER_RESPONSE' });
  });

  it('/api/mentors/[slug] wires the public read without options', async () => {
    const { GET } = await import('../[slug]/route');

    expect(GET).toEqual({ handler: 'getPublicMentorPage', options: undefined });
  });
});
