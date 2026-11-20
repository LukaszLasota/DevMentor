import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { psql } from './psql';

// Mentor page end to end (spec 2026-10-21-mentor-page, step 11): an invited mentor (CLI → GitHub
// stub → accept) saves a draft on /mentor/profile, is refused publishing without a link, completes
// and publishes, and a signed-out visitor opens the share link; rename keeps the link, clearing a
// gate field is refused, unpublish is a true HTTP 404, republish restores the same slug, and two
// equal names get distinct slugs. Personas are unique per run; tests share one browser and run in order.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const { runInviteCli } = await import('@devmentor/core/cli');
const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const browser = createAgentBrowser(`devmentor-mentor-page-${process.pid}`);
const second = createAgentBrowser(`devmentor-mentor-page-2-${process.pid}`);
// One browser per twin: signing the first twin out to reuse a browser would end that twin's session.
const third = createAgentBrowser(`devmentor-mentor-page-3-${process.pid}`);
const MENTOR_LOGIN = `mp-ada-${run}`;
const TWIN_LOGIN = `mp-twin-${run}`;
const NAME = `Ada Lovelace ${run}`;
const SLUG = `ada-lovelace-${run}`;
const LINK = 'https://github.com/ada/analytical-engine';
const BIO = 'Wrote the first program for an engine that was never built.';
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const PUBLIC_KEYS = ['avatarUrl', 'bio', 'displayName', 'offerReady', 'publicWorkUrl', 'slots', 'slug', 'stackTags'];
const NO_RATINGS = /\b(ratings?|scores?|reviews?|rank(ing)?|stars?)\b/i;

type Browser = ReturnType<typeof createAgentBrowser>;

/** `npm run invite -- create` in-process → the printed link. */
async function invite(email: string, tags: string): Promise<string> {
  const out: string[] = [];
  const err: string[] = [];
  const argv = ['create', '--email', email, '--tags', tags, '--operator', 'it', '--batch', `mp-${run}`];
  const code = await runInviteCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text) });

  expect(code, err.join('\n')).toBe(0);
  return /^https?:\/\/\S+\/invitation\/\S+$/m.exec(out.join('\n'))?.[0] as string;
}

/** Invite → GitHub stub sign-in as `login` → accept; returns the session cookie header. */
async function onboardMentor(page: Browser, login: string): Promise<string> {
  const link = await invite(`${login}@devmentor.test`, 'python');
  const token = link.slice(`${baseUrl}/invitation/`.length);

  await page.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: `/invitation/${token}`, login })}`);
  await page.waitForUrl(`**/invitation/${token}`);
  await page.waitForIdle();
  await page.clickButton('Accept invitation');
  await page.waitForUrl('**/mentor');

  return `dm_session=${await page.cookie('dm_session')}`;
}

/**
 * A mentor whose page is published with `displayName`, through the owner API (fixture for the
 * slug-collision case); returns the session cookie.
 */
async function seedPublishedMentorProfile(page: Browser, login: string, displayName: string): Promise<string> {
  const cookie = await onboardMentor(page, login);
  const res = await fetch(`${baseUrl}/api/mentors/me`, {
    method: 'PUT',
    headers: { ...CSRF, cookie },
    body: JSON.stringify({ displayName, publicWorkUrl: LINK, bio: BIO, stackTags: ['python'] }),
  });

  expect(res.status).toBe(200);
  return cookie;
}

const publish = (cookie: string) => fetch(`${baseUrl}/api/mentors/me/publish`, { method: 'POST', headers: { ...CSRF, cookie } });
const profileOf = (login: string) =>
  psql(
    `select coalesce(p.slug, '-'), p.published_at is not null from mentor_profiles p join users u on u.id = p.user_id
     where u.email = '${login}@devmentor.test'`,
  );

afterAll(async () => {
  await browser.close();
  await second.close();
  await third.close();
  await psql(`delete from invitations where batch = 'mp-${run}'`);
  await psql(`delete from users where email like 'mp-%-${run}@devmentor.test'`);
});

describe('mentor page: draft → refused publish → publish → share link (agent-browser)', () => {
  let cookie: string;

  it('links the page step from /mentor to /mentor/profile', async () => {
    cookie = await onboardMentor(browser, MENTOR_LOGIN);

    await browser.waitForText('Publish your page');
    expect(await browser.attr('main a[href="/mentor/profile"]', 'href')).toBe('/mentor/profile');
    expect(await browser.text('nav[aria-label="Main"]')).toContain('Your page');
  });

  it('saves a draft without a public-work link; the draft has no slug and no public route', async () => {
    await browser.open(`${baseUrl}/mentor/profile`);
    await browser.waitForText('Before you can publish');
    await browser.waitForIdle();

    await browser.fill('input[name="displayName"]', NAME);
    await browser.fill('textarea[name="bio"]', BIO);
    await browser.run('find', 'role', 'checkbox', 'click', '--name', 'Python');
    await browser.run('find', 'role', 'checkbox', 'click', '--name', 'AI agents');
    await browser.clickButton('Save draft');
    await browser.waitForText('Saved.');

    expect(await browser.text('main')).toContain('3 of 4 done');
    expect(await profileOf(MENTOR_LOGIN)).toBe('-|f');
    expect((await fetch(`${baseUrl}/m/${SLUG}`)).status).toBe(404);
  });

  it('refuses to publish without the link and names it on its field', async () => {
    await browser.clickButton('Publish');
    await browser.waitForText('Add a link to your public work.');

    expect(await browser.attr('input[name="publicWorkUrl"]', 'aria-invalid')).toBe('true');
    expect(await profileOf(MENTOR_LOGIN)).toBe('-|f');
  });

  it('publishes once complete and shows the share link with Copy link', async () => {
    await browser.fill('input[name="publicWorkUrl"]', LINK);
    await browser.clickButton('Save draft');
    await browser.waitForText('Saved.');
    await browser.clickButton('Publish');
    await browser.waitForText('Your page is published.');

    expect(await browser.value('#share-link')).toBe(`${baseUrl}/m/${SLUG}`);
    expect(await browser.text('main')).toContain('This link stays the same if you change your name.');
    expect(await browser.text('main')).toContain('Copy link');
    expect(await browser.text('main')).not.toMatch(NO_RATINGS);
    expect(await profileOf(MENTOR_LOGIN)).toBe(`${SLUG}|t`);
  });

  it('a signed-out visitor opens the share link and sees name, link, bio and tags — no ratings', async () => {
    const res = await fetch(`${baseUrl}/m/${SLUG}`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain(NAME);
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain('rel="noopener nofollow ugc"');
    expect(html).toContain(BIO);
    expect(html).toContain('AI agents');
    expect(html).toContain('Not bookable yet');

    await second.open(`${baseUrl}/m/${SLUG}`);
    await second.waitForText(NAME);
    expect(await second.text('main')).not.toMatch(NO_RATINGS);

    const api = await fetch(`${baseUrl}/api/mentors/${SLUG}`);
    const { data } = await api.json();
    expect(api.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(PUBLIC_KEYS);
    expect(JSON.stringify(data)).not.toMatch(/@devmentor\.test|publishDueAt|initialPublishDueAt|invitation|githubLogin/);
  });

  it('keeps the link after a rename and refuses clearing the link on the published page', async () => {
    const renamed = await fetch(`${baseUrl}/api/mentors/me`, {
      method: 'PUT',
      headers: { ...CSRF, cookie },
      body: JSON.stringify({ displayName: `Ada King ${run}` }),
    });
    expect(renamed.status).toBe(200);
    expect(renamed.headers.get('cache-control')).toBe('no-store');

    const page = await fetch(`${baseUrl}/m/${SLUG}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`Ada King ${run}`);

    const cleared = await fetch(`${baseUrl}/api/mentors/me`, {
      method: 'PUT',
      headers: { ...CSRF, cookie },
      body: JSON.stringify({ publicWorkUrl: '' }),
    });
    const body = await cleared.json();
    expect(cleared.status).toBe(400);
    expect(Object.keys(body.error.fieldErrors)).toEqual(['publicWorkUrl']);
    expect(await (await fetch(`${baseUrl}/m/${SLUG}`)).text()).toContain(`href="${LINK}"`);
  });

  it('refuses anything but the four tags and a credential URL at the API', async () => {
    const bad = await fetch(`${baseUrl}/api/mentors/me`, {
      method: 'PUT',
      headers: { ...CSRF, cookie },
      body: JSON.stringify({ stackTags: ['rust'], publicWorkUrl: 'https://user:pass@example.com' }),
    });

    expect(bad.status).toBe(400);
    expect(Object.keys((await bad.json()).error.fieldErrors).sort()).toEqual(['publicWorkUrl', 'stackTags']);
  });

  it('unpublish gives HTTP 404 on the page (proxy) and the API; republish restores the same slug', async () => {
    await browser.open(`${baseUrl}/mentor/profile`);
    await browser.waitForIdle();
    await browser.clickButton('Unpublish');
    await browser.clickButton('Unpublish page');
    await browser.waitForText('Your page is hidden.');

    expect((await fetch(`${baseUrl}/m/${SLUG}`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/mentors/${SLUG}`)).status).toBe(404);
    expect(await profileOf(MENTOR_LOGIN)).toBe(`${SLUG}|f`);

    await browser.clickButton('Publish');
    await browser.waitForText('Your page is published.');
    expect(await browser.value('#share-link')).toBe(`${baseUrl}/m/${SLUG}`);
    expect((await fetch(`${baseUrl}/m/${SLUG}`)).status).toBe(200);
  });

  it('answers 404 for a never-published slug and for /api/mentors/<anything>', async () => {
    const missing = await fetch(`${baseUrl}/m/nobody-${run}`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).not.toContain('Not bookable yet');
    expect((await fetch(`${baseUrl}/api/mentors/nobody-${run}`)).status).toBe(404);
  });

  it('the owner routes refuse a visitor (401) and keep no copy (no-store)', async () => {
    const res = await fetch(`${baseUrl}/api/mentors/me`);

    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('mentor page: two mentors with the same name', () => {
  it('get distinct, non-reserved slugs when they publish at once', async () => {
    const twinName = `Twin Name ${run}`;
    const firstCookie = await seedPublishedMentorProfile(second, TWIN_LOGIN, twinName);
    const secondCookie = await seedPublishedMentorProfile(third, `mp-twinb-${run}`, twinName);

    const [a, b] = await Promise.all([publish(firstCookie), publish(secondCookie)]);
    const slugs = [(await a.json()).data.slug, (await b.json()).data.slug].sort();

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(slugs).toEqual([`twin-name-${run}`, `twin-name-${run}-2`]);
  });
});
