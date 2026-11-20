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
  updateOwnMentorPrices: 'updateOwnMentorPrices',
  listMentors: 'listMentors',
  MENTOR_LIST_RESPONSE: 'MENTOR_LIST_RESPONSE',
  MENTOR_PAGE_RESPONSE: 'MENTOR_PAGE_RESPONSE',
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

  it('/api/mentors/me/prices wires PUT with no-store headers', async () => {
    const { PUT } = await import('./prices/route');

    expect(PUT).toEqual({ handler: 'updateOwnMentorPrices', options: 'MENTOR_OWNER_RESPONSE' });
  });

  it('/api/mentors wires the public list with no-store headers', async () => {
    const { GET } = await import('../route');

    expect(GET).toEqual({ handler: 'listMentors', options: 'MENTOR_LIST_RESPONSE' });
  });

  it('/api/mentors/[slug] wires the public read with no-store headers', async () => {
    const { GET } = await import('../[slug]/route');

    expect(GET).toEqual({ handler: 'getPublicMentorPage', options: 'MENTOR_PAGE_RESPONSE' });
  });
});
