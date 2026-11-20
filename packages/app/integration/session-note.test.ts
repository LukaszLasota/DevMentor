import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { mailsTo, waitForMail } from './mail';
import { psql } from './psql';

// Session notes end to end (spec 2026-11-20-session-note, step 5) against the production build and
// PostgreSQL: after a session ends the mentor sends a note, the mentee declines it with a comment, the
// mentor sees the comment and sends version 2, the mentee approves it (AC1, AC2); only the two see it
// (AC3); the mentee has no way to edit the text (AC4); the database keeps one waiting version.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `sn-${run}`;
const seeder = createAgentBrowser(`devmentor-note-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-note-mentee-${process.pid}`);
const mentor = createAgentBrowser(`devmentor-note-mentor-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const NOTE_1 = `Note ${run} v1: retries behind a queue, idempotent handler.`;
const NOTE_2 = `Note ${run} v2: retries, idempotency, and dead-letter handling.`;
const COMMENT = `Please add the dead-letter part ${run}.`;

let menteeCookie: string;
let strangerCookie: string;
let ada: MentorFixture;
let sessionId: string;

async function signIn(browser: ReturnType<typeof createAgentBrowser>, login: string): Promise<string> {
  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: '/mentors', login })}`);
  await browser.waitForUrl('**/mentors');

  return `dm_session=${await browser.cookie('dm_session')}`;
}

async function api(path: string, cookie: string | null, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...CSRF, ...(cookie ? { cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  menteeCookie = await signIn(mentee, `sn-mentee-${run}`);
  ada = await seedBookableMentor(seeder, { login: `sn-ada-${run}`, displayName: `Note Ada ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
  const stranger = createAgentBrowser(`devmentor-note-stranger-${process.pid}`);
  strangerCookie = await signIn(stranger, `sn-stranger-${run}`);
  await stranger.close();
  await signIn(mentor, `sn-ada-${run}`);

  const [slot] = (await api(`/api/mentors/${ada.slug}`, null)).body.data.slots;
  const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
  await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  sessionId = started.body.data.bookingId;
  expect(await psql(`select status from bookings where id = '${sessionId}'`)).toBe('confirmed');
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await mentor.close();
  await psql(`delete from session_note_versions where booking_id = '${sessionId}'`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'sn-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'sn-%-${run}@devmentor.test'`);
});

describe('session note (agent-browser, two parties)', () => {
  it('cannot be written before the session ends', async () => {
    const early = await api(`/api/sessions/${sessionId}/note`, ada.cookie, { method: 'POST', body: { body: NOTE_1 } });
    expect([early.status, early.body.error.code]).toEqual([409, 'NOTE_NOT_OPEN']);
  });

  it('the mentor sends it from /sessions/[id]; the mentee is asked to decide and cannot edit it (AC1, AC4)', async () => {
    await psql(`update bookings set starts_at = now() - interval '60 minutes', ends_at = now() - interval '35 minutes' where id = '${sessionId}'`);

    await mentor.open(`${baseUrl}/sessions/${sessionId}`);
    await mentor.waitForText('Session note');
    await mentor.waitForIdle();
    await mentor.fill('textarea[name="body"]', NOTE_1);
    await mentor.clickButton('Send to the mentee');
    await mentor.waitForText("Waiting for the mentee's decision.");

    await mentee.open(`${baseUrl}/sessions/${sessionId}`);
    await mentee.waitForText(NOTE_1);
    expect(await mentee.text('main')).toContain('It is not published anywhere.');
    expect(await mentee.count('textarea[name="body"]')).toBe(0);
    expect((await waitForMail(`sn-mentee-${run}@devmentor.test`, 2)).subject).toBe('Your session note is ready for review');
    expect((await api(`/api/sessions/${sessionId}/note`, ada.cookie, { method: 'POST', body: { body: NOTE_2 } })).body.error.code).toBe('NOTE_PENDING');
  });

  it('the mentee declines with a comment; the mentor sees it and sends version 2 (AC2)', async () => {
    await mentee.waitForIdle();
    await mentee.clickButton('Decline');
    await mentee.fill('#decline-comment', COMMENT);
    await mentee.clickButton('Decline with this comment');
    await mentee.waitForText('You declined the last version');

    await mentor.open(`${baseUrl}/sessions/${sessionId}`);
    await mentor.waitForText(COMMENT);
    expect((await waitForMail(`sn-ada-${run}@devmentor.test`, 2)).subject).toBe('The mentee declined your session note');

    const sent = await api(`/api/sessions/${sessionId}/note`, ada.cookie, { method: 'POST', body: { body: NOTE_2 } });
    expect(sent.body.data).toMatchObject({ state: 'waiting' });
    expect(sent.body.data.versions.map((version: { version: number }) => version.version)).toEqual([1, 2]);
  });

  it('the mentee approves; both see the approved note, nobody else does (AC3)', async () => {
    const byMentor = await api(`/api/sessions/${sessionId}/note/decision`, ada.cookie, { method: 'POST', body: { decision: 'approved', version: 2 } });
    expect(byMentor.status).toBe(403);

    const approved = await api(`/api/sessions/${sessionId}/note/decision`, menteeCookie, { method: 'POST', body: { decision: 'approved', version: 2 } });
    expect(approved.body.data).toMatchObject({ state: 'approved', canSend: false });
    const again = await api(`/api/sessions/${sessionId}/note/decision`, menteeCookie, { method: 'POST', body: { decision: 'approved', version: 2 } });
    expect(again.status).toBe(200);

    await mentor.open(`${baseUrl}/sessions/${sessionId}`);
    await mentor.waitForText(NOTE_2);
    expect(await mentor.text('main')).toContain('Approved');

    expect((await api(`/api/sessions/${sessionId}/note`, strangerCookie)).status).toBe(404);
    expect((await api(`/api/sessions/${sessionId}/note`, null)).status).toBe(401);
    expect(JSON.stringify(await mailsTo(`sn-mentee-${run}@devmentor.test`))).not.toContain(NOTE_1);
  });
});

describe('session note constraints (migration against a real PostgreSQL)', () => {
  it('keeps one waiting version, and a decline needs a comment while a waiting version has none', async () => {
    const insert = (version: number, decision: string, comment: string) =>
      psql(
        `insert into session_note_versions (id, booking_id, version, body, sent_at, decision, decision_comment, decided_at) values (gen_random_uuid(), '${sessionId}', ${version}, repeat('x', 30), now(), ${decision}, ${comment}, ${decision === 'null' ? 'null' : 'now()'})`,
      );

    await expect(insert(3, "'approved'", 'null')).rejects.toMatchObject({ stderr: expect.stringContaining('session_note_versions_approved_uq') });
    await expect(insert(3, "'declined'", 'null')).rejects.toMatchObject({ stderr: expect.stringContaining('session_note_versions_comment_check') });
    await expect(insert(3, 'null', "'a waiting comment'")).rejects.toMatchObject({ stderr: expect.stringContaining('session_note_versions_comment_check') });
    await expect(insert(3, "'maybe'", 'null')).rejects.toMatchObject({ stderr: expect.stringMatching(/session_note_versions_(decision|comment)_check/) });
    await expect(insert(2, "'declined'", "'a long enough comment'")).rejects.toMatchObject({ stderr: expect.stringContaining('session_note_versions_booking_version_uq') });
  });
});
