import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { mailsTo, waitForMail } from './mail';
import { psql } from './psql';

// Text sessions end to end (spec 2026-11-20-text-session, steps 5 and 7) against the production build,
// PostgreSQL and the Stripe stub: a paid booking becomes a session; at its start the mentee and the
// mentor exchange text in two browsers (AC1), every session screen says it is text (AC2), the mentor
// submits the written answer and the mentee reads it and is emailed (AC3), and nobody else gets in (AC4).
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `ts-${run}`;
const seeder = createAgentBrowser(`devmentor-session-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-session-mentee-${process.pid}`);
const mentor = createAgentBrowser(`devmentor-session-mentor-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const MENTEE_EMAIL = `ts-mentee-${run}@devmentor.test`;
const TEXT_ONLY = 'Sessions are text — no video call.';
const ANSWER = `Answer ${run}: put the retries behind a queue and make the handler idempotent.`;

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

/** Moves the booking's start (and end) to `minutes` from now, as if that time had come. */
const startIn = (minutes: number) =>
  psql(
    `update bookings set starts_at = now() + interval '${minutes} minutes', ends_at = now() + interval '${minutes} minutes' + make_interval(mins => length_minutes) where id = '${sessionId}'`,
  );

beforeAll(async () => {
  menteeCookie = await signIn(mentee, `ts-mentee-${run}`);
  ada = await seedBookableMentor(seeder, { login: `ts-ada-${run}`, displayName: `Session Ada ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
  const stranger = createAgentBrowser(`devmentor-session-stranger-${process.pid}`);
  strangerCookie = await signIn(stranger, `ts-stranger-${run}`);
  await stranger.close();

  const [slot] = (await api(`/api/mentors/${ada.slug}`, null)).body.data.slots;
  const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
  await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  sessionId = started.body.data.bookingId;
  expect(await psql(`select status from bookings where id = '${sessionId}'`)).toBe('confirmed');

  // The mentor's browser shares the seeder's account.
  await mentor.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: '/mentors', login: `ts-ada-${run}` })}`);
  await mentor.waitForUrl('**/mentors');
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await mentor.close();
  await psql(`delete from session_answers where booking_id = '${sessionId}'`);
  await psql(`delete from session_messages where booking_id = '${sessionId}'`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'ts-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'ts-%-${run}@devmentor.test'`);
});

describe('text session (agent-browser, two parties)', () => {
  it('lists the session under My sessions for both, says it is text, and is closed before the start', async () => {
    await mentee.open(`${baseUrl}/sessions`);
    await mentee.waitForText('My sessions');
    expect(await mentee.text('main')).toContain(TEXT_ONLY);
    expect(await mentee.text('main')).toContain(`Session Ada ${run}`);

    await mentor.open(`${baseUrl}/sessions`);
    await mentor.waitForText('My sessions');
    expect(await mentor.text('main')).toContain(`ts-mentee-${run}`);

    await mentee.open(`${baseUrl}/sessions/${sessionId}`);
    await mentee.waitForText('This session opens at');
    expect(await mentee.text('main')).toContain(TEXT_ONLY);
    const early = await api(`/api/sessions/${sessionId}/messages`, menteeCookie, { method: 'POST', body: { body: 'Too early' } });
    expect([early.status, early.body.error.code]).toEqual([409, 'SESSION_NOT_OPEN']);
  });

  it('at the start, the two exchange text and each sees the other within a poll (AC1)', async () => {
    await startIn(-1);

    await mentee.open(`${baseUrl}/sessions/${sessionId}`);
    await mentee.waitForText('Conversation');
    await mentee.waitForIdle();
    await mentee.fill('#session-message', `Hi from the mentee ${run}`);
    await mentee.clickButton('Send');
    await mentee.waitForText(`Hi from the mentee ${run}`);

    await mentor.open(`${baseUrl}/sessions/${sessionId}`);
    await mentor.waitForText(`Hi from the mentee ${run}`);
    await mentor.waitForIdle();
    await mentor.fill('#session-message', `Hello from the mentor ${run}`);
    await mentor.clickButton('Send');

    // The mentee's open page picks it up by polling.
    await mentee.waitForText(`Hello from the mentor ${run}`);

    const read = await api(`/api/sessions/${sessionId}?after=0`, menteeCookie);
    expect(read.body.data.messages.map((message: { mine: boolean; body: string }) => [message.mine, message.body])).toEqual([
      [true, `Hi from the mentee ${run}`],
      [false, `Hello from the mentor ${run}`],
    ]);
    const [first, second] = read.body.data.messages as { seq: number }[];
    expect((await api(`/api/sessions/${sessionId}?after=${first?.seq}`, menteeCookie)).body.data.messages).toHaveLength(1);
    expect(Number(second?.seq)).toBeGreaterThan(Number(first?.seq));
  });

  it('nobody else can open or write to it: 404, like an unknown id (AC4)', async () => {
    expect((await api(`/api/sessions/${sessionId}`, strangerCookie)).status).toBe(404);
    expect((await api(`/api/sessions/${sessionId}/messages`, strangerCookie, { method: 'POST', body: { body: 'Hi' } })).status).toBe(404);
    expect((await api(`/api/sessions/${sessionId}`, null)).status).toBe(401);
    expect((await api(`/api/sessions/${randomUUID()}`, menteeCookie)).status).toBe(404);
  });

  it('another mentor and an operator (signed in, with their own access) cannot read or write it either (threat model T-02)', async () => {
    const before = (await api(`/api/sessions/${sessionId}`, menteeCookie)).body.data.messages;
    const otherMentor = await seedBookableMentor(seeder, { login: `ts-bo-${run}`, displayName: `Session Bo ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
    const operator = createAgentBrowser(`devmentor-session-operator-${process.pid}`);
    const operatorCookie = await signIn(operator, 'mock-operator');
    await operator.close();
    // Positive controls: both accounts are signed in and reach what is theirs.
    expect((await api('/api/mentors/me', otherMentor.cookie)).status).toBe(200);
    expect((await api('/api/auth/me', operatorCookie)).body.data.user.roles).toContain('operator');

    for (const cookie of [otherMentor.cookie, operatorCookie]) {
      expect((await api(`/api/sessions/${sessionId}`, cookie)).status).toBe(404);
      expect((await api(`/api/sessions/${sessionId}/messages`, cookie, { method: 'POST', body: { body: `let me in ${run}` } })).status).toBe(404);
      expect((await api(`/api/sessions/${sessionId}/note`, cookie)).status).toBe(404);
    }
    expect((await api(`/api/sessions/${sessionId}`, menteeCookie)).body.data.messages).toEqual(before);
  });

  it('the mentee cannot submit the answer; the mentor submits it once; the mentee reads it and is emailed (AC3)', async () => {
    const byMentee = await api(`/api/sessions/${sessionId}/answer`, menteeCookie, { method: 'POST', body: { body: ANSWER } });
    expect(byMentee.status).toBe(403);

    await mentor.open(`${baseUrl}/sessions/${sessionId}`);
    await mentor.waitForText('Your written answer');
    await mentor.waitForIdle();
    await mentor.fill('textarea[name="body"]', ANSWER);
    await mentor.clickButton('Submit answer');
    await mentor.waitForText('Submitted');

    const again = await api(`/api/sessions/${sessionId}/answer`, ada.cookie, { method: 'POST', body: { body: ANSWER } });
    expect([again.status, again.body.error.code]).toEqual([409, 'ALREADY_ANSWERED']);

    await mentee.open(`${baseUrl}/sessions/${sessionId}`);
    await mentee.waitForText(ANSWER);
    const mail = await waitForMail(MENTEE_EMAIL, 2);
    expect(mail.subject).toBe(`Session Ada ${run} sent your written answer`);
    expect(mail.text).toContain(`/sessions/${sessionId}`);
    expect(JSON.stringify(await mailsTo(MENTEE_EMAIL))).not.toContain(ANSWER);
  });

  it('after the wrap-up the chat is read-only', async () => {
    await startIn(-60);

    const late = await api(`/api/sessions/${sessionId}/messages`, menteeCookie, { method: 'POST', body: { body: 'Late' } });
    expect([late.status, late.body.error.code]).toEqual([409, 'SESSION_NOT_OPEN']);
    await mentee.open(`${baseUrl}/sessions/${sessionId}`);
    await mentee.waitForText('The chat is closed.');
    expect(await mentee.text('main')).toContain(`Hello from the mentor ${run}`);
  });
});

describe('session constraints (migration against a real PostgreSQL)', () => {
  it('bounds message and answer bodies and keeps one answer per session', async () => {
    const author = `(select mentee_id from bookings where id = '${sessionId}')`;

    await expect(psql(`insert into session_messages (id, booking_id, author_id, body, created_at) values (gen_random_uuid(), '${sessionId}', ${author}, '', now())`)).rejects.toMatchObject({
      stderr: expect.stringContaining('session_messages_body_check'),
    });
    await expect(psql(`insert into session_answers (id, booking_id, author_id, body, submitted_at) values (gen_random_uuid(), '${sessionId}', ${author}, repeat('x', 30), now())`)).rejects.toMatchObject({
      stderr: expect.stringContaining('session_answers_booking_id_unique'),
    });
  });
});
