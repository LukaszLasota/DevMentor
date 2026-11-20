import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { mailsTo, waitForMail } from './mail';
import { psql } from './psql';
import { resendStubEvent, stubEvents } from './stripe';

// Booking cancellation end to end (spec 2026-11-20-booking-cancellation, step 7) against the production
// build, PostgreSQL and the local Stripe stub: a mentee cancels more than 24 hours ahead and gets a full
// refund, the time reopens and the mentor sees it (AC1, AC4); later, the fee is forfeited only after
// the mentee saw it (AC2); a refund Stripe refuses lands on /admin, where the operator retries it.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const stubUrl = inject('stripeStubUrl');
const run = randomUUID().slice(0, 8);
const batch = `cx-${run}`;
const seeder = createAgentBrowser(`devmentor-cancel-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-cancel-mentee-${process.pid}`);
const operator = createAgentBrowser(`devmentor-cancel-operator-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const MENTEE_EMAIL = `cx-mentee-${run}@devmentor.test`;

let menteeCookie: string;
let operatorCookie: string;

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

const publicSlots = async (slug: string): Promise<{ id: string }[]> => (await api(`/api/mentors/${slug}`, null)).body.data.slots;
const row = (id: string) => psql(`select status, refund_status, refund_id is not null, cancelled_at is not null from bookings where id = '${id}'`);
const stubRefunds = async (): Promise<{ id: string; payment_intent: string; metadata: { booking_id?: string } }[]> =>
  (await fetch(`${stubUrl}/__stub/refunds`)).json();

/** Books the mentor's first open time and pays on the stub's hosted page; returns the confirmed booking. */
async function bookAndPay(mentor: MentorFixture): Promise<{ bookingId: string; slotId: string }> {
  const [slot] = await publicSlots(mentor.slug as string);
  const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot?.id, length: '25' } });
  expect(started.status).toBe(200);
  await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
  expect((await row(started.body.data.bookingId)).split('|')[0]).toBe('confirmed');

  return { bookingId: started.body.data.bookingId, slotId: slot?.id as string };
}

const mentor = (name: string, slotInHours: number) =>
  seedBookableMentor(seeder, { login: `cx-${name}-${run}`, displayName: `Cancel ${name} ${run}`, stackTags: ['python'], batch, slotInHours });

const cancel = (bookingId: string, expectRefund: boolean, cookie = menteeCookie) =>
  api(`/api/bookings/${bookingId}/cancel`, cookie, { method: 'POST', body: { expectRefund } });

beforeAll(async () => {
  menteeCookie = await signIn(mentee, `cx-mentee-${run}`, '/mentors');
  operatorCookie = await signIn(operator, 'mock-operator', '/admin');
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  await operator.close();
  // Bookings restrict deleting their slot, mentor and mentee: remove them first.
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'cx-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'cx-%-${run}@devmentor.test'`);
});

describe('cancel more than 24 hours ahead: full refund, the time reopens (AC1, AC4)', () => {
  let ada: MentorFixture;
  let booking: { bookingId: string; slotId: string };

  beforeAll(async () => {
    ada = await mentor('ada', 48);
    booking = await bookAndPay(ada);
  });

  it('shows the free-cancellation terms on /bookings/[id] before cancelling', async () => {
    await mentee.open(`${baseUrl}/bookings/${booking.bookingId}`);
    await mentee.waitForText('Booked');
    const text = (await mentee.text('main')).replace(/\s+/g, ' ');

    expect(text).toContain('Free cancellation until');
    expect(text).toContain('back in full');
    expect(text).not.toMatch(/respond|reply within|guarantee/i);
    expect((await api(`/api/bookings/${booking.bookingId}`, menteeCookie)).body.data.cancellation).toMatchObject({ refundDue: true });
  });

  it('cancels, refunds the PaymentIntent in full once, and the page says so', async () => {
    const response = await cancel(booking.bookingId, true);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'cancelled', refundStatus: 'succeeded', cancellation: null });
    expect(await row(booking.bookingId)).toBe('cancelled|succeeded|t|t');
    expect((await stubRefunds()).filter((refund) => refund.metadata.booking_id === booking.bookingId)).toHaveLength(1);

    await mentee.open(`${baseUrl}/bookings/${booking.bookingId}`);
    await mentee.waitForText('Cancelled');
    expect((await mentee.text('main')).replace(/\s+/g, ' ')).toContain('is being refunded in full to your card');
  });

  it('a repeat cancel changes nothing and never refunds twice', async () => {
    expect((await cancel(booking.bookingId, true)).body.data.status).toBe('cancelled');
    expect((await stubRefunds()).filter((refund) => refund.metadata.booking_id === booking.bookingId)).toHaveLength(1);
  });

  it('offers the time again and shows the mentor it was cancelled', async () => {
    expect((await publicSlots(ada.slug as string)).map((slot) => slot.id)).toContain(booking.slotId);

    const mine = await api('/api/availability/slots', ada.cookie);
    expect(mine.body.data.items.find((slot: { id: string }) => slot.id === booking.slotId)).toMatchObject({ booking: 'cancelled' });
  });

  it('emails the mentee and the mentor', async () => {
    expect((await waitForMail(MENTEE_EMAIL, 2)).subject).toBe(`Cancelled: 25-minute session with Cancel ada ${run}`);
    expect((await waitForMail(`cx-ada-${run}@devmentor.test`, 2)).subject).toMatch(/^Cancelled: 25-minute session on /);
  });

  it('a redelivered payment webhook leaves the cancelled booking alone (no orphan, no second refund)', async () => {
    const paid = await psql(`select checkout_session_id from bookings where id = '${booking.bookingId}'`);
    const completion = (await stubEvents()).find((event) => event.sessionId === paid && event.type === 'checkout.session.completed');

    expect(await resendStubEvent(completion?.id as string)).toEqual([200, 200]);
    expect(await row(booking.bookingId)).toBe('cancelled|succeeded|t|t');
  });

  it('another user cannot cancel it (404)', async () => {
    expect((await cancel(booking.bookingId, true, ada.cookie)).status).toBe(404);
  });
});

describe('cancel 24 hours or less ahead: the fee is forfeited after the mentee saw it (AC2)', () => {
  it('refuses terms the server no longer offers, then cancels without a refund', async () => {
    const bob = await mentor('bob', 10);
    const { bookingId } = await bookAndPay(bob);
    expect((await api(`/api/bookings/${bookingId}`, menteeCookie)).body.data.cancellation).toMatchObject({ refundDue: false });

    await mentee.open(`${baseUrl}/bookings/${bookingId}`);
    await mentee.waitForText('Booked');
    expect((await mentee.text('main')).replace(/\s+/g, ' ')).toContain('Cancelling now forfeits the');

    const changed = await cancel(bookingId, true);
    expect([changed.status, changed.body.error.code]).toEqual([409, 'CANCELLATION_TERMS_CHANGED']);
    expect((await row(bookingId)).split('|')[0]).toBe('confirmed');

    expect((await cancel(bookingId, false)).body.data).toMatchObject({ status: 'cancelled', refundStatus: 'not_due' });
    expect((await stubRefunds()).some((refund) => refund.metadata.booking_id === bookingId)).toBe(false);
    expect((await mailsTo(MENTEE_EMAIL)).at(-1)?.text).toContain('is not refunded');
  });
});

describe('a refund Stripe refuses: on /admin for the operator, who retries it (R16)', () => {
  it('keeps the cancellation, marks the refund failed, lists it for operators only, and a retry refunds it', async () => {
    const cy = await mentor('cy', 48);
    const { bookingId } = await bookAndPay(cy);
    await fetch(`${stubUrl}/__stub/refunds/fail-next`, { method: 'POST' });

    expect((await cancel(bookingId, true)).body.data).toMatchObject({ status: 'cancelled', refundStatus: 'failed' });

    await operator.open(`${baseUrl}/admin`);
    await operator.waitForText('Needs attention');
    const admin = (await operator.text('main')).replace(/\s+/g, ' ');
    expect(admin).toContain('Refund failed');
    expect(admin).toContain(bookingId);

    expect((await api(`/api/admin/bookings/${bookingId}/refund`, menteeCookie, { method: 'POST' })).status).toBe(403);
    expect((await api(`/api/admin/bookings/${bookingId}/refund`, operatorCookie, { method: 'POST' })).body.data).toEqual({ refundStatus: 'succeeded' });
    expect(await row(bookingId)).toBe('cancelled|succeeded|t|t');
  });
});

describe('cancellation constraints (migration against a real PostgreSQL)', () => {
  it('a cancelled booking needs when and what refund; refund states are a closed set', async () => {
    const dee = await mentor('dee', 48);
    const { bookingId } = await bookAndPay(dee);

    await expect(psql(`update bookings set status = 'cancelled' where id = '${bookingId}'`)).rejects.toMatchObject({
      stderr: expect.stringContaining('bookings_cancelled_check'),
    });
    await expect(psql(`update bookings set refund_status = 'maybe' where id = '${bookingId}'`)).rejects.toMatchObject({
      stderr: expect.stringContaining('bookings_refund_status_check'),
    });
  });
});
