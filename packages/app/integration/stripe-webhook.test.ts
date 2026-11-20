import { createHmac, randomUUID } from 'node:crypto';
import { describe, expect, inject, it } from 'vitest';
import { psql } from './psql';
import { createStubSession, resendStubEvent, STRIPE_TEST_WEBHOOK_SECRET, stubEvents } from './stripe';

// The durable Stripe webhook inbox (spec 2026-11-20-booking-stripe-checkout, phase 1) over HTTP
// against a real PostgreSQL: the Stripe stub delivers signed events to the production build, which
// stores each one once and marks it processed; a bad signature stores nothing.
const baseUrl = inject('baseUrl');

async function paidEvent() {
  const session = await createStubSession(randomUUID());
  const pay = await fetch(`${session.url}/complete`, { method: 'POST', redirect: 'manual' });
  expect(pay.status).toBe(303);

  const event = (await stubEvents()).find((candidate) => candidate.sessionId === session.id);
  expect(event).toBeDefined();

  return event!;
}

const row = (eventId: string) =>
  psql(`select type, attempts, processed_at is not null, last_error is null from stripe_events where id = '${eventId}'`);

const sign = (body: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) =>
  `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

function post(body: string, signature?: string) {
  return fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
    body,
  });
}

describe('POST /api/webhooks/stripe (Stripe stub → app → PostgreSQL)', () => {
  it('stores a signed checkout.session.completed once, processed, without a CSRF header', async () => {
    const event = await paidEvent();

    expect(event).toMatchObject({ type: 'checkout.session.completed', deliveries: [200] });
    expect(await row(event.id)).toBe('checkout.session.completed|1|t|t');
  });

  it('treats a redelivery as a no-op: one row, one attempt', async () => {
    const event = await paidEvent();

    expect(await resendStubEvent(event.id)).toEqual([200, 200]);
    expect(await psql(`select count(*) from stripe_events where id = '${event.id}'`)).toBe('1');
    expect(await row(event.id)).toBe('checkout.session.completed|1|t|t');
  });

  it('dispatches concurrent deliveries of one event once (row lock + processed_at re-check)', async () => {
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    const body = JSON.stringify({ id, object: 'event', type: 'customer.updated', created: 1, data: { object: { id: 'cus_2' } } });
    const signature = sign(body, STRIPE_TEST_WEBHOOK_SECRET);

    const responses = await Promise.all(Array.from({ length: 5 }, () => post(body, signature)));

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await psql(`select count(*) from stripe_events where id = '${id}'`)).toBe('1');
    expect(await row(id)).toBe('customer.updated|1|t|t');
  });

  it('stores a body Postgres jsonb would refuse (\\u0000) as the exact signed text', async () => {
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    const body = `{"id":"${id}","object":"event","type":"customer.updated","created":1,"data":{"object":{"name":"a\\u0000b"}}}`;

    const response = await post(body, sign(body, STRIPE_TEST_WEBHOOK_SECRET));

    expect(response.status).toBe(200);
    expect(await psql(`select payload = '${body.replaceAll("'", "''")}' from stripe_events where id = '${id}'`)).toBe('t');
  });

  it('answers the envelope with no-store', async () => {
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    const body = JSON.stringify({ id, object: 'event', type: 'customer.created', created: 1, data: { object: { id: 'cus_1' } } });
    const response = await post(body, sign(body, STRIPE_TEST_WEBHOOK_SECRET));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(await row(id)).toBe('customer.created|1|t|t');
  });

  it.each([
    ['no signature', undefined],
    ['another secret', 'whsec_other'],
    ['a stale signature', 'stale'],
  ])('refuses %s with 400 and stores nothing', async (_name, mode) => {
    const id = `evt_${randomUUID().replaceAll('-', '')}`;
    const body = JSON.stringify({ id, object: 'event', type: 'checkout.session.completed', created: 1, data: { object: {} } });
    const signature =
      mode === undefined
        ? undefined
        : mode === 'stale'
          ? sign(body, STRIPE_TEST_WEBHOOK_SECRET, Math.floor(Date.now() / 1000) - 600)
          : sign(body, mode);

    const response = await post(body, signature);

    expect(response.status).toBe(400);
    expect(await psql(`select count(*) from stripe_events where id = '${id}'`)).toBe('0');
  });

  it('expiring a session through the API delivers checkout.session.expired', async () => {
    const session = await createStubSession(randomUUID());
    const expired = await fetch(`${inject('stripeStubUrl')}/v1/checkout/sessions/${session.id}/expire`, {
      method: 'POST',
      headers: { authorization: 'Bearer sk_test_integration' },
    });
    expect(expired.status).toBe(200);

    const event = (await stubEvents()).find((candidate) => candidate.sessionId === session.id);
    expect(event).toMatchObject({ type: 'checkout.session.expired', deliveries: [200] });
    expect(await row(event!.id)).toBe('checkout.session.expired|1|t|t');
  });
});

describe('stripe_events constraints (migration against a real PostgreSQL)', () => {
  const insert = (id: string, set: string) =>
    psql(`insert into stripe_events (id, type, payload, received_at, attempts, processed_at) values ('${id}', 't', '{}', now(), ${set})`);

  it('refuses negative attempts and a processed event without an attempt', async () => {
    await expect(insert(`evt_neg_${randomUUID().slice(0, 8)}`, '-1, null')).rejects.toMatchObject({
      stderr: expect.stringContaining('stripe_events_attempts_check'),
    });
    await expect(insert(`evt_zero_${randomUUID().slice(0, 8)}`, '0, now()')).rejects.toMatchObject({
      stderr: expect.stringContaining('stripe_events_processed_check'),
    });
  });

  it('keeps one row per Stripe event id', async () => {
    const id = `evt_dup_${randomUUID().slice(0, 8)}`;
    await insert(id, '0, null');

    await expect(insert(id, '0, null')).rejects.toMatchObject({ stderr: expect.stringContaining('stripe_events_pkey') });
  });
});
