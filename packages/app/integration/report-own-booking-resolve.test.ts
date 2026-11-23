import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor } from './fixtures/mentors';
import { OPERATOR_MENTOR_LOGIN } from './fixtures/operators';
import { psql } from './psql';

// TC-PAYOUT-002 (.ai/qa/scenarios/payouts/TC-PAYOUT-002-operator-cannot-resolve-own-dispute.md), threat model
// T-06 (docs/security/threat-model.md): a person can be operator and mentor at once (spec sign-in-github-and-email).
// Resolving a dispute releases the held payout (spec 2026-11-21-mentor-payouts), so an operator must not resolve a
// report on a booking of their own mentor page: 403, and the report stays open. The same account still resolves a
// report on another mentor's booking (positive control), so the denial is about ownership, not the role.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `ro-${run}`;
const opMentorEmail = `${OPERATOR_MENTOR_LOGIN}@devmentor.test`;
const opMentorBrowser = createAgentBrowser(`devmentor-ro-opmentor-${process.pid}`);
const otherMentorBrowser = createAgentBrowser(`devmentor-ro-other-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-ro-mentee-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

let menteeCookie: string;

async function api(path: string, cookie: string | null, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? 'GET',
    headers: { ...CSRF, ...(cookie ? { cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  return { status: response.status, body: await response.json() };
}

/** A paid booking on `slug` that the mentee reports; returns the report id. */
async function reportedBooking(slug: string): Promise<string> {
  const [slot] = (await api(`/api/mentors/${slug}`, null)).body.data.slots;
  const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
  expect(started.status).toBe(200);
  const bookingId = started.body.data.bookingId as string;
  await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  const reported = await api(`/api/bookings/${bookingId}/report`, menteeCookie, { method: 'POST', body: { message: `Own-dispute ${run}: the mentor never joined.` } });
  expect(reported.status).toBe(200);

  return psql(`select id from booking_reports where booking_id = '${bookingId}'`);
}

const cleanup = async () => {
  const people = `select id from users where email = '${opMentorEmail}' or email like 'ro-%-${run}@devmentor.test'`;
  const profiles = `select id from mentor_profiles where user_id in (${people})`;
  await psql(`delete from booking_reports where booking_id in (select id from bookings where mentor_profile_id in (${profiles}))`);
  await psql(`delete from payouts where mentor_profile_id in (${profiles})`);
  await psql(`delete from bookings where mentor_profile_id in (${profiles}) or mentee_id in (${people})`);
  await psql(`delete from invitations where batch = '${batch}' or email = '${opMentorEmail}'`);
  await psql(`delete from users where email = '${opMentorEmail}' or email like 'ro-%-${run}@devmentor.test'`);
};

beforeAll(async () => {
  await cleanup(); // the operator-mentor login is fixed (it is in OPERATOR_EMAILS): drop a crashed run's leftovers
  await mentee.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo: '/mentors', login: `ro-mentee-${run}` })}`);
  await mentee.waitForUrl('**/mentors');
  menteeCookie = `dm_session=${await mentee.cookie('dm_session')}`;
});

afterAll(async () => {
  await opMentorBrowser.close();
  await otherMentorBrowser.close();
  await mentee.close();
  await cleanup();
});

describe('an operator cannot resolve a dispute on their own booking (TC-PAYOUT-002, T-06)', () => {
  it('refuses 403 and keeps the report open, while the same operator resolves another mentor\'s report', async () => {
    // Given: an operator who is also a mentor, another mentor, and a reported paid booking with each.
    const opMentor = await seedBookableMentor(opMentorBrowser, { login: OPERATOR_MENTOR_LOGIN, displayName: `Operator Mentor ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
    const other = await seedBookableMentor(otherMentorBrowser, { login: `ro-mentor-${run}`, displayName: `Other Mentor ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
    expect((await api('/api/auth/me', opMentor.cookie)).body.data.user.roles).toEqual(expect.arrayContaining(['mentor', 'operator']));
    const ownReport = await reportedBooking(opMentor.slug as string);
    const otherReport = await reportedBooking(other.slug as string);

    // Positive control: the operator role works on someone else's dispute.
    expect((await api(`/api/admin/reports/${otherReport}/resolve`, opMentor.cookie, { method: 'POST' })).status).toBe(200);

    // When: the operator resolves the dispute on their own booking.
    const own = await api(`/api/admin/reports/${ownReport}/resolve`, opMentor.cookie, { method: 'POST' });

    // Then: 403, and the report is still open (its payout stays held).
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('FORBIDDEN');
    expect(await psql(`select resolved_at is null from booking_reports where id = '${ownReport}'`)).toBe('t');
  });
});
