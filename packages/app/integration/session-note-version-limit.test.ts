import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { psql } from './psql';

// TC-NOTE-001 (.ai/qa/scenarios/notes/TC-NOTE-001-note-version-limit.md), spec 2026-11-20-session-note
// (a note has at most ten versions): when the mentee has declined all ten versions, the mentor can no
// longer send another one — the API answers 409 NOTE_LIMIT, no eleventh version is stored, and the
// session page tells the mentor to write to the DevMentor team instead of offering the form.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `nl-${run}`;
const seeder = createAgentBrowser(`devmentor-limit-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-limit-mentee-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const LIMIT = 10;

let menteeCookie: string;
let mentor: MentorFixture;
let sessionId: string;

async function api(path: string, cookie: string | null, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...CSRF, ...(cookie ? { cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  await mentee.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: '/mentors', login: `nl-mentee-${run}` })}`);
  await mentee.waitForUrl('**/mentors');
  menteeCookie = `dm_session=${await mentee.cookie('dm_session')}`;
  // The seeding browser stays signed in as the mentor and is reused for the mentor's page.
  mentor = await seedBookableMentor(seeder, { login: `nl-mentor-${run}`, displayName: `Note Limit ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await psql(`delete from session_note_versions where booking_id in (select id from bookings where mentee_id in (select id from users where email like 'nl-%-${run}@devmentor.test'))`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'nl-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'nl-%-${run}@devmentor.test'`);
});

describe('a session note stops at its version limit (TC-NOTE-001)', () => {
  it('after ten declined versions the mentor cannot send an eleventh and is told to contact the team', async () => {
    // Given: a paid session that has ended.
    const [slot] = (await api(`/api/mentors/${mentor.slug}`, null)).body.data.slots;
    const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
    expect(started.status).toBe(200);
    sessionId = started.body.data.bookingId;
    await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
    await psql(`update bookings set starts_at = now() - interval '60 minutes', ends_at = now() - interval '35 minutes' where id = '${sessionId}'`);

    // And: the mentor sent ten versions and the mentee declined each with a comment.
    for (let version = 1; version <= LIMIT; version += 1) {
      const sent = await api(`/api/sessions/${sessionId}/note`, mentor.cookie, { method: 'POST', body: { body: `Note Limit ${run}: version ${version} of the session summary.` } });
      expect(sent.status, `send version ${version}`).toBe(200);
      const declined = await api(`/api/sessions/${sessionId}/note/decision`, menteeCookie, {
        method: 'POST',
        body: { decision: 'declined', version, comment: `Version ${version} misses the docs link.` },
      });
      expect(declined.status, `decline version ${version}`).toBe(200);
    }

    // When: the mentor tries to send an eleventh version.
    const eleventh = await api(`/api/sessions/${sessionId}/note`, mentor.cookie, { method: 'POST', body: { body: `Note Limit ${run}: version 11 of the session summary.` } });

    // Then: it is refused and nothing is stored.
    expect(eleventh.status).toBe(409);
    expect(eleventh.body.error.code).toBe('NOTE_LIMIT');
    expect(await psql(`select count(*), max(version) from session_note_versions where booking_id = '${sessionId}'`)).toBe(`${LIMIT}|${LIMIT}`);

    // And: the mentor's session page explains the limit instead of offering the form.
    await seeder.open(`${baseUrl}/sessions/${sessionId}`);
    await seeder.waitForText('This note reached its version limit');
    expect(await seeder.count('section[aria-labelledby="note-heading"] textarea[name="body"]')).toBe(0);
  });
});
