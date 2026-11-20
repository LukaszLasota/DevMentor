import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedOfferReadyMentor, type MentorFixture } from './fixtures/mentors';
import { psql } from './psql';

// The composed share page end to end (spec 2026-10-21-mentor-share-link-page, step 5): a signed-out
// visitor opening an offer-ready mentor's link sees work, description, tags, both prices, open times
// and the text-session line; a published mentor without prices shows only "Not bookable yet"; an
// unpublished or unknown link is HTTP 404; previews carry the name and the page is noindex.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `sl-share-${run}`;
// The seeding browser signs mentors in; the visitor is a separate session that never signs in.
const browser = createAgentBrowser(`devmentor-share-link-${process.pid}`);
const visitor = createAgentBrowser(`devmentor-share-link-visitor-${process.pid}`);
const R01 = 'Sessions are text — no video call. 25 or 50 minutes.';
const NO_SCORES = /\b(ratings?|scores?|reviews?|rank(ing)?|stars?|top mentor|popular)\b/i;
const PUBLIC_KEYS = ['avatarUrl', 'bio', 'displayName', 'offerReady', 'prices', 'publicWorkUrl', 'slots', 'slug', 'stackTags'];
let ready: MentorFixture;
let unpriced: MentorFixture;

/** The `<main>` of the page, text only, with non-breaking spaces normalised. */
async function mainText(slug: string): Promise<string> {
  await visitor.open(`${baseUrl}/m/${slug}`);
  await visitor.waitForText(R01);
  return (await visitor.text('main')).replace(/\u00a0/g, ' ');
}

beforeAll(async () => {
  ready = await seedOfferReadyMentor(browser, { login: `sh-ready-${run}`, displayName: `Share Ready ${run}`, stackTags: ['typescript', 'ai-agents'], batch });
  unpriced = await seedOfferReadyMentor(browser, { login: `sh-unpriced-${run}`, displayName: `Share Unpriced ${run}`, stackTags: ['react'], batch, prices: false });
});

afterAll(async () => {
  await browser.close();
  await visitor.close();
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'sh-%-${run}@devmentor.test'`);
});

describe('share-link page: what a signed-out visitor sees (agent-browser)', () => {
  it('an offer-ready mentor: work, description, tags, both prices, open times and the text-session line', async () => {
    const text = await mainText(ready.slug as string);

    expect(await visitor.cookie('dm_session')).toBeUndefined();
    expect(text).toContain(`Share Ready ${run}`);
    expect(text).toContain(`github.com/sh-ready-${run}`);
    expect(text).toContain(`Share Ready ${run} ships production systems.`);
    expect(text).toContain('TypeScript');
    expect(text).toContain('AI agents');
    expect(text).toContain('PLN 150.00');
    expect(text).toContain('PLN 300.00');
    expect(text).toContain('Times are shown in your time zone');
    expect(text).toContain(R01);
    expect(text).not.toContain('Not bookable yet');
    expect(text).not.toMatch(NO_SCORES);
    expect(await visitor.count('main button')).toBe(0);
    expect(await visitor.count('main input[type="search"]')).toBe(0);
  });

  it('a published mentor without prices: the text-session line and only "Not bookable yet"', async () => {
    const text = await mainText(unpriced.slug as string);

    expect(text).toContain('Not bookable yet');
    expect(text).toContain(R01);
    expect(text).not.toContain('PLN');
    expect(text).not.toContain('Times are shown in your time zone');
    expect(await visitor.count('main ul[aria-label="Open times"]')).toBe(0);
  });

  it('previews carry the name and description; the page is noindex', async () => {
    const opened = await visitor.open(`${baseUrl}/m/${ready.slug}`);
    await visitor.waitForText(R01);

    expect(opened.title).toBe(`Share Ready ${run} · DevMentor`);
    expect(await visitor.attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
    expect(await visitor.attr('meta[property="og:title"]', 'content')).toBe(`Share Ready ${run} · DevMentor`);
    expect(await visitor.attr('meta[property="og:url"]', 'content')).toBe(`${baseUrl}/m/${ready.slug}`);
  });

  it('the API answers the composed allowlist with no-store', async () => {
    const res = await fetch(`${baseUrl}/api/mentors/${ready.slug}`);
    const { data } = await res.json();

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(data).sort()).toEqual(PUBLIC_KEYS);
    expect(data.offerReady).toBe(true);
    expect(data.slots.length).toBeGreaterThan(0);
  });

  it('an unpublished or unknown link answers HTTP 404', async () => {
    const unpublished = await fetch(`${baseUrl}/api/mentors/me/unpublish`, {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', cookie: unpriced.cookie },
    });
    expect(unpublished.status).toBe(200);

    expect((await fetch(`${baseUrl}/m/${unpriced.slug}`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/m/nobody-${run}`)).status).toBe(404);
  });
});
