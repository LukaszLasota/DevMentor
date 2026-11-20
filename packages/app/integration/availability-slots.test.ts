import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { psql } from './psql';

// Availability slots end to end (spec 2026-10-21-availability-slots, step 10): an invited mentor
// (CLI → GitHub stub → accept) publishes their page, then a slot tomorrow and one in one hour; a
// signed-out visitor sees the first enabled and the second disabled with the reason; the mentor
// removes the first on /mentor/slots and it is gone from the page. Slots are published through the
// API (native datetime inputs ignore agent-browser `fill`, lesson 2026-10-26); the datetime field's
// local → UTC conversion is unit-tested with fixed zones. Personas are unique per run; tests share
// one browser and run in order.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const { runInviteCli } = await import('@devmentor/core/cli');
const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const browser = createAgentBrowser(`devmentor-slots-${process.pid}`);
const other = createAgentBrowser(`devmentor-slots-2-${process.pid}`);
const LOGIN = `sl-ada-${run}`;
const OTHER_LOGIN = `sl-other-${run}`;
const NAME = `Slot Mentor ${run}`;
const SLUG = `slot-mentor-${run}`;
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const DISABLED = 'Starts in less than two hours — no longer bookable';
const HOUR_MS = 3_600_000;

type Browser = ReturnType<typeof createAgentBrowser>;

/** Tomorrow's slot of the main mentor, shared by both describe blocks (they run in order). */
let tomorrow: { id: string; startsAt: string };

/** A whole-minute UTC instant `hours` from now. */
function inHours(hours: number): string {
  const instant = new Date(Date.now() + hours * HOUR_MS);
  instant.setUTCSeconds(0, 0);

  return instant.toISOString();
}

async function invite(email: string): Promise<string> {
  const out: string[] = [];
  const err: string[] = [];
  const argv = ['create', '--email', email, '--tags', 'python', '--operator', 'it', '--batch', `sl-${run}`];
  const code = await runInviteCli({ argv, stdout: (text) => out.push(text), stderr: (text) => err.push(text) });

  expect(code, err.join('\n')).toBe(0);
  return /^https?:\/\/\S+\/invitation\/\S+$/m.exec(out.join('\n'))?.[0] as string;
}

/** Invite → GitHub stub sign-in as `login` → accept; returns the session cookie header. */
async function onboardMentor(page: Browser, login: string): Promise<string> {
  const link = await invite(`${login}@devmentor.test`);
  const token = link.slice(`${baseUrl}/invitation/`.length);

  await page.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: `/invitation/${token}`, login })}`);
  await page.waitForUrl(`**/invitation/${token}`);
  await page.waitForIdle();
  await page.clickButton('Accept invitation');
  await page.waitForUrl('**/mentor');

  return `dm_session=${await page.cookie('dm_session')}`;
}

/** Polls `check` until it returns true (the UI action's request lands asynchronously), max ~10 s. */
async function eventually(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('condition not met within 10 s');
}

const api = (path: string, cookie: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}${path}`, { ...init, headers: { ...CSRF, cookie, ...(init.headers ?? {}) } });
const publishSlot = (cookie: string, startsAt: string) =>
  api('/api/availability/slots', cookie, { method: 'POST', body: JSON.stringify({ startsAt }) });

afterAll(async () => {
  await browser.close();
  await other.close();
  await psql(`delete from invitations where batch = 'sl-${run}'`);
  await psql(`delete from users where email like 'sl-%-${run}@devmentor.test'`);
});

describe('availability slots: publish → public page with lead-time state → remove (agent-browser)', () => {
  let cookie: string;

  it('a published mentor without slots is "Not bookable yet" and /mentor asks for a slot', async () => {
    cookie = await onboardMentor(browser, LOGIN);
    const page = await api('/api/mentors/me', cookie, {
      method: 'PUT',
      body: JSON.stringify({ displayName: NAME, publicWorkUrl: 'https://github.com/ada/engine', bio: 'Engines.', stackTags: ['python'] }),
    });
    expect(page.status).toBe(200);
    expect((await api('/api/mentors/me/publish', cookie, { method: 'POST' })).status).toBe(200);

    expect(await (await fetch(`${baseUrl}/m/${SLUG}`)).text()).toContain('Not bookable yet');
    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForText('Publish a slot');
    expect(await browser.attr('main a[href="/mentor/slots"]', 'href')).toBe('/mentor/slots');
    expect(await browser.text('nav[aria-label="Main"]')).toContain('Open times');
  });

  it('publishes a slot tomorrow and one in an hour; the ordering key moves to now', async () => {
    const first = await publishSlot(cookie, inHours(24));
    const soon = await publishSlot(cookie, inHours(1));
    tomorrow = (await first.json()).data;

    expect([first.status, soon.status]).toEqual([200, 200]);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(tomorrow.startsAt).toBe(inHours(24));
    expect(
      await psql(
        `select last_published_availability_at > now() - interval '5 minutes' from mentor_profiles p join users u on u.id = p.user_id where u.email = '${LOGIN}@devmentor.test'`,
      ),
    ).toBe('t');
  });

  it('a signed-out visitor sees tomorrow enabled and the one-hour slot disabled with the reason', async () => {
    const html = await (await fetch(`${baseUrl}/m/${SLUG}`)).text();
    const api2 = await (await fetch(`${baseUrl}/api/mentors/${SLUG}`)).json();

    expect(html).not.toContain('Not bookable yet');
    expect(html).toContain(DISABLED);
    expect(api2.data.offerReady).toBe(true);
    expect(api2.data.slots.map((slot: { meetsLeadTime: boolean }) => slot.meetsLeadTime)).toEqual([false, true]);
    for (const slot of api2.data.slots) {
      expect(Object.keys(slot).sort()).toEqual(['id', 'meetsLeadTime', 'startsAt']);
    }
    expect(html).not.toMatch(/\b(ratings?|scores?|reviews?|guaranteed|reserved)\b/i);
  });

  it('/mentor/slots lists both with their state and /mentor marks the slot step done', async () => {
    await browser.open(`${baseUrl}/mentor/slots`);
    await browser.waitForText('Your open times');
    const table = await browser.text('main table');

    expect(table).toContain('Bookable');
    expect(table).toContain('Less than 2 h away');

    await browser.open(`${baseUrl}/mentor`);
    await browser.waitForText('Publish a slot');
    // The state is a screen-reader word ("Done: "), not colour alone; the link only shows while to do.
    expect(await browser.text('main')).toMatch(/Done:\s*Publish a slot/);
    expect(await browser.count('main a[href="/mentor/slots"]')).toBe(0);
  });

  it('removes tomorrow\'s slot after confirmation; it is gone from the page and the key is unchanged', async () => {
    const keyBefore = await psql(
      `select last_published_availability_at from mentor_profiles p join users u on u.id = p.user_id where u.email = '${LOGIN}@devmentor.test'`,
    );
    await browser.open(`${baseUrl}/mentor/slots`);
    await browser.waitForText('Your open times');
    await browser.waitForIdle();
    // Rows are ascending: the one-hour slot first, tomorrow's second.
    await browser.click('main table tbody tr:nth-child(2) button');
    await browser.clickButton('Remove slot');

    await eventually(async () => (await psql(`select removed_at is not null from slots where id = '${tomorrow.id}'`)) === 't');
    const remaining = (await (await api('/api/availability/slots', cookie)).json()).data.items;
    expect(remaining.map((slot: { id: string }) => slot.id)).not.toContain(tomorrow.id);
    // Only the one-hour slot is left: not bookable, so the mentor is no longer offer-ready.
    expect(await (await fetch(`${baseUrl}/m/${SLUG}`)).text()).toContain('Not bookable yet');
    expect(
      await psql(
        `select last_published_availability_at from mentor_profiles p join users u on u.id = p.user_id where u.email = '${LOGIN}@devmentor.test'`,
      ),
    ).toBe(keyBefore);
  });

  it('republishes the removed start time', async () => {
    expect((await publishSlot(cookie, tomorrow.startsAt)).status).toBe(200);
  });
});

describe('availability slots: refusals over HTTP', () => {
  let cookie: string;

  it('refuses past and beyond-horizon starts with a field error, duplicates with 409', async () => {
    cookie = `dm_session=${await browser.cookie('dm_session')}`;
    const past = await publishSlot(cookie, inHours(-1));
    const far = await publishSlot(cookie, inHours(24 * 366));
    const duplicate = await publishSlot(cookie, tomorrow.startsAt);

    expect(past.status).toBe(400);
    expect(Object.keys((await past.json()).error.fieldErrors)).toEqual(['startsAt']);
    expect(far.status).toBe(400);
    expect(duplicate.status).toBe(409);
  });

  it('another mentor cannot remove the slot (404) and nothing changes', async () => {
    const mine = (await (await api('/api/availability/slots', cookie)).json()).data.items[0];
    const otherCookie = await onboardMentor(other, OTHER_LOGIN);

    const res = await api(`/api/availability/slots/${mine.id}`, otherCookie, { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(await psql(`select removed_at is null from slots where id = '${mine.id}'`)).toBe('t');
  });

  it('answers 401 signed out and 403 without CSRF', async () => {
    expect((await fetch(`${baseUrl}/api/availability/slots`)).status).toBe(401);
    const noCsrf = await fetch(`${baseUrl}/api/availability/slots`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ startsAt: inHours(30) }),
    });
    expect(noCsrf.status).toBe(403);
  });

  it('keeps one active slot per start under the partial unique index, and allows it again once removed', async () => {
    const profileId = await psql(
      `select p.id from mentor_profiles p join users u on u.id = p.user_id where u.email = '${LOGIN}@devmentor.test'`,
    );
    const at = inHours(48);
    const insert = (removed: string) =>
      `insert into slots (id, mentor_profile_id, starts_at, removed_at, created_at, updated_at) values (gen_random_uuid(), '${profileId}', '${at}', ${removed}, now(), now())`;

    await psql(insert('now()'));
    await psql(insert('null'));
    await expect(psql(insert('null'))).rejects.toMatchObject({ stderr: expect.stringContaining('slots_mentor_starts_at_active_uq') });
  });
});
