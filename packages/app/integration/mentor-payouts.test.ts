import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { inHours, seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { psql } from './psql';
import { STRIPE_TEST_SECRET_KEY } from './stripe';

// Mentor payouts end to end (spec 2026-11-21-mentor-payouts, step 6) against the production build,
// PostgreSQL and the Stripe stub: a mentor without Connect is held; the mentor connects through Stripe's
// (stubbed) hosted onboarding and sees "Payouts enabled"; the operator releases and the stub records one
// transfer of 80% bound to the session's charge; a repeat changes nothing; a lost transfer answer is
// adopted, never repeated; a disputed charge is held; nobody else can release or connect.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const stubUrl = inject('stripeStubUrl');
const run = randomUUID().slice(0, 8);
const batch = `po-${run}`;
const seeder = createAgentBrowser(`devmentor-payout-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-payout-mentee-${process.pid}`);
const mentor = createAgentBrowser(`devmentor-payout-mentor-${process.pid}`);
const operator = createAgentBrowser(`devmentor-payout-operator-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

let menteeCookie: string;
let operatorCookie: string;
let ada: MentorFixture;
let first: { bookingId: string; sessionId: string };

type StubTransfer = { id: string; amount: number; destination: string; source_transaction: string; transfer_group: string };

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
const payout = (bookingId: string) => psql(`select status, coalesce(hold_reason, ''), gross_cents, fee_cents, net_cents from payouts where booking_id = '${bookingId}'`);
const transfersOf = async (bookingId: string): Promise<StubTransfer[]> =>
  ((await (await fetch(`${stubUrl}/__stub/transfers`)).json()) as StubTransfer[]).filter((transfer) => transfer.transfer_group === `booking_${bookingId}`);

/** Books the mentor's open time `slotId`, pays on the stub and moves the session two days into the past. */
async function paidSessionTwoDaysAgo(slotId: string): Promise<{ bookingId: string; sessionId: string }> {
  const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId, length: '25' } });
  expect(started.status).toBe(200);
  await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  const bookingId = started.body.data.bookingId as string;
  await psql(`update bookings set starts_at = now() - interval '2 days', ends_at = now() - interval '2 days' + interval '25 minutes' where id = '${bookingId}'`);

  return { bookingId, sessionId: await psql(`select checkout_session_id from bookings where id = '${bookingId}'`) };
}

async function openSlot(hours: number): Promise<string> {
  return (await api('/api/availability/slots', ada.cookie, { method: 'POST', body: { startsAt: inHours(hours) } })).body.data.id;
}

beforeAll(async () => {
  menteeCookie = await signIn(mentee, `po-mentee-${run}`, '/mentors');
  operatorCookie = await signIn(operator, 'mock-operator', '/admin');
  ada = await seedBookableMentor(seeder, { login: `po-ada-${run}`, displayName: `Payout Ada ${run}`, stackTags: ['python'], batch, slotInHours: 48 });
  await signIn(mentor, `po-ada-${run}`, '/mentors');
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await mentor.close();
  await operator.close();
  await psql(`delete from payouts where mentor_profile_id in (select p.id from mentor_profiles p join users u on u.id = p.user_id where u.email like 'po-%-${run}@devmentor.test')`);
  await psql(`delete from connect_accounts where mentor_profile_id in (select p.id from mentor_profiles p join users u on u.id = p.user_id where u.email like 'po-%-${run}@devmentor.test')`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'po-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'po-%-${run}@devmentor.test'`);
});

describe('mentor payouts (agent-browser + Stripe stub)', () => {
  it('holds a finished session while the mentor has no connected account', async () => {
    const [slot] = (await api(`/api/mentors/${ada.slug}`, null)).body.data.slots;
    first = await paidSessionTwoDaysAgo(slot.id);

    expect((await release()).status).toBe(200);
    expect(await payout(first.bookingId)).toBe('held|connect_not_enabled|15000|3000|12000');
    expect(await transfersOf(first.bookingId)).toEqual([]);
  });

  it('the mentor connects through the hosted onboarding and sees payouts enabled (#26)', async () => {
    await mentor.open(`${baseUrl}/mentor/payouts`);
    await mentor.waitForText('Set up payouts');
    await mentor.waitForIdle();
    await mentor.clickButton('Set up payouts');
    await mentor.waitForText('Stripe stub onboarding');
    await mentor.clickButton('Complete onboarding');
    await mentor.waitForUrl('**/mentor/payouts?connect=return');
    await mentor.waitForText('refresh the status shortly');
    await mentor.waitForIdle();
    await mentor.clickButton('Refresh status');
    await mentor.waitForText('Payouts enabled');

    expect(await psql(`select onboarding_status from connect_accounts c join mentor_profiles p on p.id = c.mentor_profile_id join users u on u.id = p.user_id where u.email = 'po-ada-${run}@devmentor.test'`)).toBe('enabled');
  });

  it('the operator releases: one transfer of 80% bound to the session charge; a repeat changes nothing (#35)', async () => {
    expect((await release()).status).toBe(200);
    expect(await payout(first.bookingId)).toBe('transferred||15000|3000|12000');

    const charge = (await (await fetch(`${stubUrl}/v1/checkout/sessions/${first.sessionId}?expand%5B0%5D=payment_intent.latest_charge`, { headers: { authorization: `Bearer ${STRIPE_TEST_SECRET_KEY}` } })).json()) as {
      payment_intent?: { latest_charge?: { id: string } };
    };
    const [transfer] = await transfersOf(first.bookingId);
    expect(transfer).toMatchObject({ amount: 12000, transfer_group: `booking_${first.bookingId}` });
    expect(transfer?.source_transaction).toBe(charge.payment_intent?.latest_charge?.id);
    expect(transfer?.source_transaction).toMatch(/^ch_test_/);

    await release();
    expect(await transfersOf(first.bookingId)).toHaveLength(1);
  });

  it('adopts a transfer whose answer was lost instead of repeating it', async () => {
    const second = await paidSessionTwoDaysAgo(await openSlot(50));
    await fetch(`${stubUrl}/__stub/transfers/drop-next`, { method: 'POST' });

    await release();
    expect((await payout(second.bookingId)).split('|')[0]).toBe('transferring');
    expect(await transfersOf(second.bookingId)).toHaveLength(1);

    await psql(`update payouts set updated_at = now() - interval '11 minutes' where booking_id = '${second.bookingId}'`);
    await release();
    expect((await payout(second.bookingId)).split('|')[0]).toBe('transferred');
    expect(await transfersOf(second.bookingId)).toHaveLength(1);
  });

  it('holds a session whose charge was disputed (a chargeback)', async () => {
    const third = await paidSessionTwoDaysAgo(await openSlot(52));
    await fetch(`${stubUrl}/__stub/charges/${third.sessionId}/dispute`, { method: 'POST' });

    await release();
    expect(await payout(third.bookingId)).toBe('held|charge_reversed|15000|3000|12000');
    expect(await transfersOf(third.bookingId)).toEqual([]);

    await operator.open(`${baseUrl}/admin`);
    await operator.waitForText('Release payouts');
    expect((await operator.text('main')).replace(/\s+/g, ' ')).toContain('Held: charge refunded or disputed');
  });

  it('only the operator releases and only a mentor connects', async () => {
    expect((await api('/api/admin/payouts/release', menteeCookie, { method: 'POST' })).status).toBe(403);
    expect((await api('/api/admin/payouts/release', ada.cookie, { method: 'POST' })).status).toBe(403);
    expect((await api('/api/mentors/me/connect/start', menteeCookie, { method: 'POST' })).status).toBe(403);
    expect((await api('/api/mentors/me/connect/refresh', null, { method: 'POST' })).status).toBe(401);
  });
});

describe('payout constraints (migration against a real PostgreSQL)', () => {
  it('keeps fee + net = gross, a reason for held, and one payout per booking', async () => {
    const insert = (gross: number, fee: number, net: number, status: string, reason: string) =>
      psql(
        `insert into payouts (id, booking_id, mentor_profile_id, gross_cents, fee_bps, fee_cents, net_cents, currency, status, hold_reason, created_at, updated_at)
         select gen_random_uuid(), id, mentor_profile_id, ${gross}, 2000, ${fee}, ${net}, 'PLN', '${status}', ${reason}, now(), now() from bookings where id = '${first.bookingId}'`,
      );

    await expect(insert(100, 20, 79, 'failed', 'null')).rejects.toMatchObject({ stderr: expect.stringContaining('payouts_amounts_check') });
    await expect(insert(100, 20, 80, 'held', 'null')).rejects.toMatchObject({ stderr: expect.stringContaining('payouts_held_check') });
    await expect(insert(100, 20, 80, 'failed', 'null')).rejects.toMatchObject({ stderr: expect.stringContaining('payouts_booking_id_unique') });
    await expect(psql(`update bookings set fee_bps = null where id = '${first.bookingId}'`)).rejects.toMatchObject({ stderr: expect.stringContaining('bookings_fee_snapshot_check') });
  });
});
