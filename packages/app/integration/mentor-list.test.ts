import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { inHours, seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { psql } from './psql';

// The public mentor list end to end (spec 2026-10-21-mentor-list, step 8): three bookable mentors with
// distinct tags published in order, one without a slot and one with a draft page; a signed-out
// visitor sees exactly the three, most recent published availability first, filters by React, follows
// a card to /m/<slug>; no rating, score or search anywhere. Other test files may leave mentors in the
// shared database, so assertions look at this run's mentors only (unique per run).
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `ml-${run}`;
const browser = createAgentBrowser(`devmentor-mentor-list-${process.pid}`);
const NO_SCORES = /\b(ratings?|scores?|reviews?|rank(ing)?|stars?|top mentor|search)\b/i;
const seeded: Record<string, MentorFixture> = {};

/** This run's slugs, in the order they appear in `text` (page HTML or API JSON). */
function ourOrder(text: string): string[] {
  return ['first', 'second', 'third', 'noslot', 'draft']
    .map((key) => ({ key, slug: seeded[key]?.slug }))
    .filter((entry): entry is { key: string; slug: string } => typeof entry.slug === 'string' && text.includes(`/m/${entry.slug}"`))
    .sort((a, b) => text.indexOf(`/m/${a.slug}"`) - text.indexOf(`/m/${b.slug}"`))
    .map((entry) => entry.key);
}

afterAll(async () => {
  await browser.close();
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'ml-%-${run}@devmentor.test'`);
});

describe('mentor list: who is listed, in which order, by tag (agent-browser)', () => {
  it('seeds three bookable mentors published in order, one without a slot and one draft', async () => {
    seeded.first = await seedBookableMentor(browser, { login: `ml-first-${run}`, displayName: `First ${run}`, stackTags: ['python'], batch });
    // A second slot for First, published right away (before Second exists), so removing one later
    // keeps First listed: AC2 "removing a slot does not change the order".
    const extra = await fetch(`${baseUrl}/api/availability/slots`, {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', 'content-type': 'application/json', cookie: seeded.first.cookie },
      body: JSON.stringify({ startsAt: inHours(48) }),
    });
    expect(extra.status).toBe(200);
    seeded.second = await seedBookableMentor(browser, { login: `ml-second-${run}`, displayName: `Second ${run}`, stackTags: ['react'], batch });
    seeded.third = await seedBookableMentor(browser, { login: `ml-third-${run}`, displayName: `Third ${run}`, stackTags: ['react', 'ai-agents'], batch });
    seeded.noslot = await seedBookableMentor(browser, { login: `ml-noslot-${run}`, displayName: `Noslot ${run}`, stackTags: ['react'], batch, slotInHours: null });
    seeded.draft = await seedBookableMentor(browser, { login: `ml-draft-${run}`, displayName: `Draft ${run}`, stackTags: ['react'], batch, publish: false });

    expect(
      await psql(
        `select count(*) from mentor_profiles p join users u on u.id = p.user_id
         where u.email like 'ml-%-${run}@devmentor.test' and p.last_published_availability_at is not null`,
      ),
    ).toBe('4');
  });

  it('a signed-out visitor sees exactly the three bookable mentors, most recent first, with no scores or search', async () => {
    const res = await fetch(`${baseUrl}/mentors`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(ourOrder(html)).toEqual(['third', 'second', 'first']);
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).not.toMatch(NO_SCORES);
    expect(html).not.toContain('<ol');
    expect(html).not.toContain('type="search"');
  });

  it('the React filter shows only React mentors, a multi-tag mentor included', async () => {
    const html = await (await fetch(`${baseUrl}/mentors?tag=react`)).text();

    expect(ourOrder(html)).toEqual(['third', 'second']);
  });

  it('the API serves the same list with the item allowlist and 400 for an unknown or repeated tag', async () => {
    const res = await fetch(`${baseUrl}/api/mentors?tag=react`);
    const { data } = await res.json();
    const ours = data.items.filter((item: { slug: string }) => item.slug.endsWith(run));

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(ours.map((item: { slug: string }) => item.slug)).toEqual([seeded.third?.slug, seeded.second?.slug]);
    for (const item of ours) {
      expect(Object.keys(item).sort()).toEqual(['avatarUrl', 'bio', 'displayName', 'nextBookableSlotAt', 'prices', 'publicWorkUrl', 'slug', 'stackTags']);
    }
    expect((await fetch(`${baseUrl}/api/mentors?tag=rust`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/api/mentors?tag=react&tag=python`)).status).toBe(400);
  });

  it('an unknown tag renders its state with HTTP 200 and no mentors', async () => {
    const res = await fetch(`${baseUrl}/mentors?tag=java`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Unknown stack tag.');
    expect(ourOrder(html)).toEqual([]);
  });

  it('a card leads to the mentor\'s page', async () => {
    await browser.open(`${baseUrl}/mentors?tag=python`);
    await browser.waitForText(`First ${run}`);
    await browser.click(`a[href="/m/${seeded.first?.slug}"]`);
    await browser.waitForUrl(`**/m/${seeded.first?.slug}`);
    await browser.waitForText(`First ${run}`);
    expect(await browser.text('main')).not.toContain('Not bookable yet');
  });

  it('removing one of several slots keeps a mentor in place (the key never moves back)', async () => {
    const firstSlots = (await (await fetch(`${baseUrl}/api/availability/slots`, { headers: { cookie: seeded.first?.cookie as string } })).json()).data.items;
    const removed = await fetch(`${baseUrl}/api/availability/slots/${firstSlots[1].id}`, {
      method: 'DELETE',
      headers: { 'x-devmentor-request': '1', cookie: seeded.first?.cookie as string },
    });
    expect(removed.status).toBe(200);

    expect(ourOrder(await (await fetch(`${baseUrl}/mentors`)).text())).toEqual(['third', 'second', 'first']);
  });

  it('removing the only slot takes a mentor off the list; the order of the others stays', async () => {
    const mine = (await (await fetch(`${baseUrl}/api/availability/slots`, { headers: { cookie: seeded.second?.cookie as string } })).json()).data.items[0];
    const removed = await fetch(`${baseUrl}/api/availability/slots/${mine.id}`, {
      method: 'DELETE',
      headers: { 'x-devmentor-request': '1', cookie: seeded.second?.cookie as string },
    });
    expect(removed.status).toBe(200);

    expect(ourOrder(await (await fetch(`${baseUrl}/mentors`)).text())).toEqual(['third', 'first']);
  });
});
