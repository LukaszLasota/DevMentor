import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor } from './fixtures/mentors';
import { psql } from './psql';

// TC-PAYOUT-001 (.ai/qa/scenarios/payouts/TC-PAYOUT-001-reported-session-held-until-resolved.md), spec
// 2026-11-21-mentor-payouts (a reported booking is held) with 2026-11-20-booking-cancellation phase 2
// (reports): a finished, paid session the mentee reported is not paid out to a connected mentor — the
// operator sees "Held: reported booking". Only after the operator marks the report resolved does the next
// release send one transfer of 80% to the mentor.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const stubUrl = inject('stripeStubUrl');
const run = randomUUID().slice(0, 8);
const batch = `rh-${run}`;
const seeder = createAgentBrowser(`devmentor-hold-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-hold-mentee-${process.pid}`);
const operator = createAgentBrowser(`devmentor-hold-operator-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

let menteeCookie: string;
let operatorCookie: string;

type StubTransfer = { amount: number; transfer_group: string };

async function signIn(browser: ReturnType<typeof createAgentBrowser>, login: string, returnTo: string): Promise<string> {
  await browser.open(`${baseUrl}/api/auth/github?${new URLSearchParams({ returnTo, login })}`);
  await browser.waitForUrl(`**${returnTo}`);

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

const release = () => api('/api/admin/payouts/release', operatorCookie, { method: 'POST' });
const payout = (bookingId: string) => psql(`select status, coalesce(hold_reason, ''), net_cents from payouts where booking_id = '${bookingId}'`);
const transfersOf = async (bookingId: string): Promise<StubTransfer[]> =>
  ((await (await fetch(`${stubUrl}/__stub/transfers`)).json()) as StubTransfer[]).filter((transfer) => transfer.transfer_group === `booking_${bookingId}`);

beforeAll(async () => {
  menteeCookie = await signIn(mentee, `rh-mentee-${run}`, '/mentors');
  operatorCookie = await signIn(operator, 'mock-operator', '/admin');
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await operator.close();
  await psql(`delete from payouts where mentor_profile_id in (select p.id from mentor_profiles p join users u on u.id = p.user_id where u.email like 'rh-%-${run}@devmentor.test')`);
  await psql(`delete from connect_accounts where mentor_profile_id in (select p.id from mentor_profiles p join users u on u.id = p.user_id where u.email like 'rh-%-${run}@devmentor.test')`);
  await psql(`delete from booking_reports where booking_id in (select id from bookings where mentee_id in (select id from users where email like 'rh-%-${run}@devmentor.test'))`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'rh-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'rh-%-${run}@devmentor.test'`);
});

describe('a reported session is not paid out until the operator resolves the report (TC-PAYOUT-001)', () => {
  it('holds the payout as "reported booking", then transfers 80% once after Mark resolved', async () => {
    // Given: a connected mentor and a paid session that ended two days ago, which the mentee reported.
    const mentor = await seedBookableMentor(seeder, { login: `rh-mentor-${run}`, displayName: `Report Hold ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
    const connect = await api('/api/mentors/me/connect/start', mentor.cookie, { method: 'POST' });
    expect(connect.status).toBe(200);
    await fetch(`${connect.body.data.url}/complete`, { method: 'POST', redirect: 'manual' });
    expect((await api('/api/mentors/me/connect/refresh', mentor.cookie, { method: 'POST' })).status).toBe(200);
    expect(await psql(`select onboarding_status from connect_accounts c join mentor_profiles p on p.id = c.mentor_profile_id join users u on u.id = p.user_id where u.email = 'rh-mentor-${run}@devmentor.test'`)).toBe('enabled');

    const [slot] = (await api(`/api/mentors/${mentor.slug}`, null)).body.data.slots;
    const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
    expect(started.status).toBe(200);
    const bookingId = started.body.data.bookingId as string;
    await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
    const message = `Report Hold ${run}: the mentor left after five minutes.`;
    expect((await api(`/api/bookings/${bookingId}/report`, menteeCookie, { method: 'POST', body: { message } })).status).toBe(200);
    await psql(`update bookings set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '25 minutes' where id = '${bookingId}'`);

    // When: the operator releases payouts (one call settles every due booking: nothing may be left over).
    const first = await release();
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ remaining: 0 });
    expect(first.body.data.held).toBeGreaterThanOrEqual(1);

    // Then: the payout is held for the report, no money moves, and /admin says why.
    expect(await payout(bookingId)).toBe('held|disputed|12000');
    expect(await transfersOf(bookingId)).toEqual([]);
    await operator.open(`${baseUrl}/admin`);
    await operator.waitForText('Held: reported booking');
    // This booking's row carries the label: the State cell is followed by the Booking id cell
    // (other files' held payouts may be listed too).
    expect((await operator.text('main')).replace(/\s+/g, ' ')).toMatch(new RegExp(`Held: reported booking\\s*${bookingId}`));

    // When: the operator marks the report resolved and releases again.
    const reportId = await psql(`select id from booking_reports where booking_id = '${bookingId}'`);
    expect((await api(`/api/admin/reports/${reportId}/resolve`, operatorCookie, { method: 'POST' })).status).toBe(200);
    const second = await release();
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ remaining: 0 });

    // Then: exactly one transfer of 80% (120.00 of 150.00 PLN) reaches the mentor; a repeat adds nothing.
    expect(await payout(bookingId)).toBe('transferred||12000');
    expect((await transfersOf(bookingId)).map((transfer) => transfer.amount)).toEqual([12000]);
    await release();
    expect(await transfersOf(bookingId)).toHaveLength(1);
  });
});
