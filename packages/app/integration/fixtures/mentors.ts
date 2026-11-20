import { expect, inject } from 'vitest';
import type { createAgentBrowser } from '../agent-browser';

// Bookable-mentor fixtures (spec 2026-10-21-mentor-list, "Integration fixtures"): a mentor is built
// the way a real one is — invitation CLI → GitHub stub sign-in → accept → owner API — so every
// fixture passes through the same services and readiness rules the app uses. #29 reuses them.

type Browser = ReturnType<typeof createAgentBrowser>;

const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

export interface MentorFixtureOptions {
  /** Unique per run, e.g. `ml-ada-<run>`; the email is `<login>@devmentor.test`. */
  login: string;
  displayName: string;
  stackTags: string[];
  /** Invitation batch, for cleanup. */
  batch: string;
  /** Publish the page (default true). */
  publish?: boolean;
  /** Set both prices inside the integration bounds (default true). */
  prices?: boolean;
  /** Publish one slot this many hours ahead (default 24; `null` = none). */
  slotInHours?: number | null;
}

export interface MentorFixture {
  cookie: string;
  slug: string | null;
}

/** A whole-minute UTC instant `hours` from now. */
export function inHours(hours: number): string {
  const instant = new Date(Date.now() + hours * 3_600_000);
  instant.setUTCSeconds(0, 0);

  return instant.toISOString();
}

/**
 * An invited, accepted mentor with a complete page, published, priced and with one bookable slot by
 * default; the options switch each part off. One browser can seed several mentors: each sign-in
 * replaces the browser's cookie, while the returned cookies stay valid.
 */
export async function seedBookableMentor(browser: Browser, options: MentorFixtureOptions): Promise<MentorFixture> {
  const baseUrl = inject('baseUrl');
  const { runInviteCli } = await import('@devmentor/core/cli');
  const out: string[] = [];
  const err: string[] = [];
  const argv = ['create', '--email', `${options.login}@devmentor.test`, '--tags', 'python', '--operator', 'it', '--batch', options.batch];
  expect(await runInviteCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text) }), err.join('\n')).toBe(0);
  const link = /^https?:\/\/\S+\/invitation\/\S+$/m.exec(out.join('\n'))?.[0] as string;
  const token = link.slice(`${baseUrl}/invitation/`.length);

  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: `/invitation/${token}`, login: options.login })}`);
  await browser.waitForUrl(`**/invitation/${token}`);
  await browser.waitForIdle();
  await browser.clickButton('Accept invitation');
  await browser.waitForUrl('**/mentor');
  const cookie = `dm_session=${await browser.cookie('dm_session')}`;
  const call = async (path: string, method: string, body?: unknown) => {
    const res = await fetch(`${baseUrl}${path}`, { method, headers: { ...CSRF, cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    expect(res.status, `${method} ${path}`).toBe(200);
    return (await res.json()).data;
  };

  await call('/api/mentors/me', 'PUT', {
    displayName: options.displayName,
    publicWorkUrl: `https://github.com/${options.login}`,
    bio: `${options.displayName} ships production systems.`,
    stackTags: options.stackTags,
  });
  let slug: string | null = null;
  if (options.publish ?? true) {
    slug = (await call('/api/mentors/me/publish', 'POST')).slug;
  }
  if (options.prices ?? true) {
    await call('/api/mentors/me/prices', 'PUT', { price25: '150', price50: '300' });
  }
  const slotInHours = options.slotInHours === undefined ? 24 : options.slotInHours;
  if (slotInHours !== null) {
    await call('/api/availability/slots', 'POST', { startsAt: inHours(slotInHours) });
  }

  return { cookie, slug };
}
