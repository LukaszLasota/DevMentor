import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createAgentBrowser } from './agent-browser';
import { inHours, seedBookableMentor, type MentorFixture } from './fixtures/mentors';
import { mailsTo, waitForMail } from './mail';
import { psql } from './psql';
import { resendStubEvent, stubEvents } from './stripe';

// Booking and Stripe Checkout end to end (spec 2026-11-20-booking-stripe-checkout, step 11) against
// the production build, PostgreSQL and the local Stripe stub: a signed-in mentee books from the
// mentor page, pays on the stub's hosted page and lands on /bookings/[id] as Booked (AC1, AC2, AC5);
// Cancel releases the time (AC3); two mentees racing get one Checkout (AC4); lengths that overlap
// another booking are refused; a redelivered webhook changes nothing.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.APP_URL = inject('baseUrl');
process.env.LOG_LEVEL = 'silent';

const baseUrl = inject('baseUrl');
const run = randomUUID().slice(0, 8);
const batch = `bk-${run}`;
const seeder = createAgentBrowser(`devmentor-booking-seed-${process.pid}`);
const mentee = createAgentBrowser(`devmentor-booking-mentee-${process.pid}`);
const CSRF = { 'x-devmentor-request': '1', 'content-type': 'application/json' };
const MENTEE_LOGIN = `bk-mentee-${run}`;
const MENTEE_EMAIL = `${MENTEE_LOGIN}@devmentor.test`;

let menteeCookie: string;

/** Signs a mentee in through the GitHub stub in `browser`; returns the session cookie header. */
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

async function publicSlots(slug: string): Promise<{ id: string; bookableLengths: string[] }[]> {
  return (await api(`/api/mentors/${slug}`, null)).body.data.slots;
}

async function eventually(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('condition not met in time');
}

const mentor = (name: string, slotInHours: number | null = 24) =>
  seedBookableMentor(seeder, { login: `bk-${name}-${run}`, displayName: `Booking ${name} ${run}`, stackTags: ['python'], batch, slotInHours });

const bookingStatus = (id: string) => psql(`select status from bookings where id = '${id}'`);

beforeAll(async () => {
  menteeCookie = await signIn(mentee, MENTEE_LOGIN);
});

afterAll(async () => {
  await seeder.close();
  await mentee.close();
  // Bookings restrict deleting their slot, mentor and mentee: remove them first.
  await psql(`delete from bookings where mentee_id in (select id from users where email like 'bk-%-${run}@devmentor.test')`);
  await psql(`delete from invitations where batch = '${batch}'`);
  await psql(`delete from users where email like 'bk-%-${run}@devmentor.test'`);
});

describe('booking: book → Stripe Checkout → Booked (agent-browser + Stripe stub)', () => {
  let ada: MentorFixture;
  let bookingId: string;
  let slotId: string;

  beforeAll(async () => {
    ada = await mentor('ada');
    slotId = (await publicSlots(ada.slug as string))[0]?.id as string;
  });

  it('shows each length with its price before paying, books, pays on Checkout and lands on Booked (AC1, AC2)', async () => {
    await mentee.open(`${baseUrl}/m/${ada.slug}`);
    await mentee.waitForIdle();
    const text = (await mentee.text('main')).replace(/ /g, ' ');
    expect(text).toContain('25 min PLN 150.00');
    expect(text).toContain('50 min PLN 300.00');

    await mentee.clickButton('Book');
    await mentee.waitForUrl('**/pay/cs_test_*');
    expect(await mentee.text('body')).toContain('PLN 150.00');
    await mentee.clickButton('Pay');
    await mentee.waitForUrl('**/bookings/*');
    await mentee.waitForText('Booked');

    bookingId = (await mentee.url()).split('/bookings/')[1] as string;
    const page = (await mentee.text('main')).replace(/ /g, ' ');
    expect(page).toContain(`25-minute text session with Booking ada ${run}`);
    expect(page).toContain('You paid PLN 150.00.');
    expect(page).not.toMatch(/respond|reply within|guarantee/i);
  });

  it('records the confirmation and the booking-to-start lead (AC5, R09)', async () => {
    expect(await psql(`select status, length_minutes, price_cents, currency, lead_minutes between 1380 and 1440 from bookings where id = '${bookingId}'`)).toBe(
      'confirmed|25|15000|PLN|t',
    );
  });

  it('takes the time off the page for everyone else, and the mentor sees it Booked without Remove', async () => {
    expect((await publicSlots(ada.slug as string)).map((slot) => slot.id)).not.toContain(slotId);

    const mine = await api('/api/availability/slots', ada.cookie);
    expect(mine.body.data.items.find((slot: { id: string }) => slot.id === slotId)).toMatchObject({ booking: 'booked' });
    expect((await api(`/api/availability/slots/${slotId}`, ada.cookie, { method: 'DELETE' })).status).toBe(409);
  });

  it('emails the mentee and the mentor once each', async () => {
    expect((await waitForMail(MENTEE_EMAIL)).subject).toBe(`Booked: 25-minute session with Booking ada ${run}`);
    expect((await waitForMail(`bk-ada-${run}@devmentor.test`)).subject).toMatch(/^New booking: 25-minute session on /);
  });

  it('a redelivered completion changes nothing and sends no second email', async () => {
    const paid = await psql(`select checkout_session_id from bookings where id = '${bookingId}'`);
    const completion = (await stubEvents()).find((candidate) => candidate.sessionId === paid && candidate.type === 'checkout.session.completed');
    expect(completion?.deliveries).toEqual([200]);

    expect(await resendStubEvent(completion?.id as string)).toEqual([200, 200]);
    expect(await bookingStatus(bookingId)).toBe('confirmed');
    expect(await mailsTo(MENTEE_EMAIL)).toHaveLength(1);
  });

  it('GET /api/bookings/[id] is the mentee\'s only: another user gets 404, signed out 401', async () => {
    expect((await api(`/api/bookings/${bookingId}`, menteeCookie)).body.data).toMatchObject({ id: bookingId, status: 'confirmed' });
    expect((await api(`/api/bookings/${bookingId}`, ada.cookie)).status).toBe(404);
    expect((await api(`/api/bookings/${bookingId}`, null)).status).toBe(401);
  });
});

describe('booking: cancel, race, overlap and refusals over HTTP (Stripe stub)', () => {
  it('Cancel on Checkout releases the hold at once and the time is open again (AC3)', async () => {
    const bob = await mentor('bob');
    const [slot] = await publicSlots(bob.slug as string);
    const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot?.id, length: '25' } });
    expect(started.status).toBe(200);
    expect((await publicSlots(bob.slug as string)).map((open) => open.id)).not.toContain(slot?.id);

    const cancel = await fetch(`${started.body.data.checkoutUrl}/cancel`, { method: 'POST', redirect: 'manual' });
    const back = new URL(cancel.headers.get('location') as string);
    expect(back.pathname).toBe(`/m/${bob.slug}`);
    expect(back.searchParams.get('checkout')).toBe('cancelled');
    expect(back.searchParams.get('booking')).toBe(started.body.data.bookingId);

    const released = await api(`/api/bookings/${started.body.data.bookingId}/release`, menteeCookie, { method: 'POST' });
    expect(released.body.data.status).toBe('expired');
    expect((await publicSlots(bob.slug as string)).map((open) => open.id)).toContain(slot?.id);
    // The stub's expiry webhook arrived and was stored too (an already-expired booking stays expired).
    await eventually(async () => (await psql(`select count(*) from stripe_events where type = 'checkout.session.expired' and payload like '%${started.body.data.bookingId}%'`)) === '1');
    expect(await bookingStatus(started.body.data.bookingId)).toBe('expired');
  });

  it('two mentees racing for one time: one Checkout, the other SLOT_TAKEN and never charged (AC4)', async () => {
    const cy = await mentor('cy');
    const [slot] = await publicSlots(cy.slug as string);
    const rival = createAgentBrowser(`devmentor-booking-rival-${process.pid}`);
    const rivalCookie = await signIn(rival, `bk-rival-${run}`);
    await rival.close();

    const [first, second] = await Promise.all([
      api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot?.id, length: '25' } }),
      api('/api/bookings', rivalCookie, { method: 'POST', body: { slotId: slot?.id, length: '50' } }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect([first, second].find((result) => result.status === 409)?.body.error.code).toBe('SLOT_TAKEN');
    expect(await psql(`select count(*) from bookings where slot_id = '${slot?.id}'`)).toBe('1');
  });

  it('a length that runs into another booking is neither offered nor accepted', async () => {
    const dee = await mentor('dee');
    const later = (await api('/api/availability/slots', dee.cookie, { method: 'POST', body: { startsAt: inHours(24.5) } })).body.data;
    const [first] = await publicSlots(dee.slug as string);

    expect((await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: later.id, length: '25' } })).status).toBe(200);

    const open = await publicSlots(dee.slug as string);
    expect(open.find((slot) => slot.id === first?.id)?.bookableLengths).toEqual(['25']);
    const refused = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: first?.id, length: '50' } });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('SLOT_TAKEN');
  });

  it('refuses the mentor\'s own time (403), a time under two hours (409 NOT_BOOKABLE) and a signed-out visitor (401)', async () => {
    const eve = await mentor('eve');
    const [slot] = await publicSlots(eve.slug as string);
    const soon = (await api('/api/availability/slots', eve.cookie, { method: 'POST', body: { startsAt: inHours(1) } })).body.data;

    expect((await api('/api/bookings', eve.cookie, { method: 'POST', body: { slotId: slot?.id, length: '25' } })).status).toBe(403);
    const tooSoon = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: soon.id, length: '25' } });
    expect([tooSoon.status, tooSoon.body.error.code]).toEqual([409, 'NOT_BOOKABLE']);
    expect((await api('/api/bookings', null, { method: 'POST', body: { slotId: slot?.id, length: '25' } })).status).toBe(401);
  });
});

describe('bookings constraints (migration against a real PostgreSQL)', () => {
  it('keeps one active booking per slot and pins the lengths and the end', async () => {
    const fay = await mentor('fay');
    const [slot] = await publicSlots(fay.slug as string);
    const started = await api('/api/bookings', menteeCookie, { method: 'POST', body: { slotId: slot?.id, length: '25' } });
    expect(started.status).toBe(200);
    const insert = (length: number, ends: string, status = 'pending_payment') =>
      psql(
        `insert into bookings (id, slot_id, mentor_profile_id, mentee_id, starts_at, ends_at, length_minutes, price_cents, currency, status, hold_expires_at, created_at, updated_at)
         select gen_random_uuid(), slot_id, mentor_profile_id, mentee_id, starts_at, ${ends}, ${length}, 100, 'PLN', '${status}', now(), now(), now()
         from bookings where id = '${started.body.data.bookingId}'`,
      );

    await expect(insert(25, "starts_at + interval '25 minutes'")).rejects.toMatchObject({ stderr: expect.stringContaining('bookings_slot_active_uq') });
    await expect(insert(30, "starts_at + interval '30 minutes'", 'expired')).rejects.toMatchObject({
      stderr: expect.stringContaining('bookings_length_check'),
    });
    await expect(insert(25, "starts_at + interval '50 minutes'", 'expired')).rejects.toMatchObject({
      stderr: expect.stringContaining('bookings_ends_check'),
    });
    await expect(insert(25, "starts_at + interval '25 minutes'", 'confirmed')).rejects.toMatchObject({
      stderr: expect.stringMatching(/bookings_slot_active_uq|bookings_confirmed_check/),
    });
  });
});
