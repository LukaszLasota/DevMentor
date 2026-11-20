import { NextResponse, type NextRequest } from 'next/server';

// True HTTP 404 for mentor share pages (spec 2026-10-21-mentor-page, Q1). With cacheComponents the
// /m/[slug] page is partially prerendered: its static shell starts the stream with 200, so a
// `notFound()` in the page can only add `noindex` (next/dist/docs: loading.md "Status codes"). The
// documented way to a real 404 is a check in Proxy before the page renders: ask the public API
// (`GET /api/mentors/[slug]`, the same allowlisted read) and, on 404, rewrite to a path no route
// matches, which Next answers with its 404 page and status. Any other answer (200, 5xx, network
// failure) lets the request through to the page, which still calls `notFound()` itself.

/** No route matches this path, so a rewrite here renders the 404 page with status 404. */
export const MENTOR_PAGE_NOT_FOUND_PATH = '/_mentor-page-not-found';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Still URL-encoded, as it travels on to the API path.
  const slug = request.nextUrl.pathname.slice('/m/'.length);
  let status: number | undefined;

  try {
    const answer = await fetch(new URL(`/api/mentors/${slug}`, request.nextUrl.origin), {
      cache: 'no-store',
    });
    status = answer.status;
  } catch {
    status = undefined;
  }

  if (status === 404) {
    return NextResponse.rewrite(new URL(MENTOR_PAGE_NOT_FOUND_PATH, request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/m/:slug',
};
