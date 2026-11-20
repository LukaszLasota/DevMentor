// @vitest-environment node
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, MENTOR_PAGE_NOT_FOUND_PATH, proxy } from './proxy';

const request = (path: string) => new NextRequest(new URL(path, 'http://app.devmentor.test'));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('proxy (/m/[slug] true 404)', () => {
  it('runs only on /m/<slug>', () => {
    expect(config.matcher).toBe('/m/:slug');
  });

  it('asks the public API and rewrites an unknown or unpublished page to the 404 path', async () => {
    const fetchMock = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await proxy(request('/m/nobody'));

    expect(fetchMock).toHaveBeenCalledWith(new URL('http://app.devmentor.test/api/mentors/nobody'), { cache: 'no-store' });
    expect(response.headers.get('x-middleware-rewrite')).toBe(`http://app.devmentor.test${MENTOR_PAGE_NOT_FOUND_PATH}`);
  });

  it.each([
    ['a published page', async () => new Response('{}', { status: 200 })],
    ['a server error', async () => new Response('{}', { status: 503 })],
    ['a network failure', async () => Promise.reject(new Error('down'))],
  ])('lets %s through to the page', async (_case, answer) => {
    vi.stubGlobal('fetch', vi.fn(answer));

    const response = await proxy(request('/m/ada'));

    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('passes the slug on as it came (still encoded)', async () => {
    const fetchMock = vi.fn<(url: URL, init?: RequestInit) => Promise<Response>>(async () => new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await proxy(request('/m/a%20b'));

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      'http://app.devmentor.test/api/mentors/a%20b',
    ]);
  });
});
