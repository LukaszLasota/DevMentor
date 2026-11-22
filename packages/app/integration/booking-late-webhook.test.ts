import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { seedBookableMentor } from './fixtures/mentors';
import { psql } from './psql';
import { resendStubEvent, stubEvents } from './stripe';

// TC-BOOK-001 (.ai/qa/scenarios/booking/TC-BOOK-001-paid-time-never-resold.md), spec
// 2026-11-20-booking-stripe-checkout § Edge cases ("Webhook delivery is down for hours"): the mentee paid,
// but the completion webhook never reached the app, so the booking is still a hold past its expiry. When
// another mentee presses Book, the app asks Stripe first, finds the session paid, confirms the first
// booking and refuses the second (SLOT_TAKEN) — a paid time is never resold, nothing is refunded, and the
// webhook, redelivered after the inbox lost it, changes nothing.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const stubUrl = inject('stripeStubUrl');
const run = randomUUID().slice(0, 8);
const batch = `lw-${run}`;
const seeder = createAgentBrowser(`devmentor-late-seed-${process.pid}`);
const payer = createAgentBrowser(`devmentor-late-payer-${process.pid}`);
const rival = createAgentBrowser(`devmentor-late-rival-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };

let payerCookie: string;
let rivalCookie: string;
let completionId: string | undefined;

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

const bookingRow = (id: string) => psql(`select status, confirmed_at is not null, coalesce(refund_status, '-') from bookings where id = '${id}'`);

beforeAll(async () => {
  payerCookie = await signIn(payer, `lw-payer-${run}`);
  rivalCookie = await signIn(rival, `lw-rival-${run}`);
});

afterAll(async () => {
  await seeder.close();
  await payer.close();
  await rival.close();
  if (completionId) await psql(`delete from stripe_events where id = '${completionId}'`);
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'lw-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'lw-%-${run}@devmentor.test'`);
});

describe('a paid time is never resold when the payment webhook is late (TC-BOOK-001)', () => {
  it('confirms the paid hold, refuses the second mentee with SLOT_TAKEN and ignores the late webhook', async () => {
    // Given: a mentee paid on Checkout, but the app never applied the completion — the booking is a hold
    // whose expiry has passed and the completion event is not in the inbox.
    const mentor = await seedBookableMentor(seeder, { login: `lw-mentor-${run}`, displayName: `Late Webhook ${run}`, stackTags: ['python'], batch });
    const [slot] = (await api(`/api/mentors/${mentor.slug}`, null)).body.data.slots;
    const started = await api('/api/bookings', payerCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });
    expect(started.status).toBe(200);
    const bookingId = started.body.data.bookingId as string;
    await fetch(`${started.body.data.checkoutUrl}/complete`, { method: 'POST', redirect: 'manual' });
    const completion = (await stubEvents()).find((event) => event.type === 'checkout.session.completed' && event.sessionId === (started.body.data.checkoutUrl as string).split('/pay/')[1]);
    expect(completion).toBeDefined();
    completionId = completion?.id;
    await psql(`delete from stripe_events where id = '${completion?.id}'`);
    await psql(`update bookings set status = 'pending_payment', confirmed_at = null, lead_minutes = null, hold_expires_at = now() - interval '1 minute' where id = '${bookingId}'`);
    // The time looks free to everyone reading the page.
    expect((await api(`/api/mentors/${mentor.slug}`, null)).body.data.slots.map((open: { id: string }) => open.id)).toContain(slot.id);

    // When: another mentee presses Book on the same time.
    const second = await api('/api/bookings', rivalCookie, { method: 'POST', body: { slotId: slot.id, length: '25' } });

    // Then: the second mentee is refused and never gets a Checkout; the payer's booking is confirmed.
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('SLOT_TAKEN');
    expect(await psql(`select count(*) from bookings where slot_id = '${slot.id}'`)).toBe('1');
    expect(await bookingRow(bookingId)).toBe('confirmed|t|-');
    expect((await api(`/api/mentors/${mentor.slug}`, null)).body.data.slots.map((open: { id: string }) => open.id)).not.toContain(slot.id);

    // And: the webhook, redelivered after the inbox lost it, changes nothing and nothing is refunded.
    expect(await resendStubEvent(completion?.id as string)).toEqual([200, 200]);
    expect(await bookingRow(bookingId)).toBe('confirmed|t|-');
    const refunds = (await (await fetch(`${stubUrl}/__stub/refunds`)).json()) as { metadata: { booking_id?: string } }[];
    expect(refunds.some((refund) => refund.metadata.booking_id === bookingId)).toBe(false);

    // And: the payer's page says Booked.
    await payer.open(`${baseUrl}/bookings/${bookingId}`);
    await payer.waitForText('Booked');
  });
});
