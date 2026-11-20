import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_EXPIRY_SECONDS, signPayload, startStripeStub } from './stripe-stub.mjs';

const SECRET_KEY = 'sk_test_stub';
const WEBHOOK_SECRET = 'whsec_stub';
const NOW = 1_800_000_000;

let stub;
let receiver;
let received;
let receiverStatus;

function startReceiver() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      received.push({ signature: req.headers['stripe-signature'], body });
      res.writeHead(receiverStatus);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/hook` }));
  });
}

beforeEach(async () => {
  received = [];
  receiverStatus = 200;
  receiver = await startReceiver();
  stub = await startStripeStub({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET, webhookUrl: receiver.url, now: () => NOW });
});

afterEach(async () => {
  await stub.close();
  await new Promise((done) => receiver.server.close(() => done()));
});

const form = (overrides = {}) =>
  new URLSearchParams({
    mode: 'payment',
    'payment_method_types[0]': 'card',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'pln',
    'line_items[0][price_data][unit_amount]': '15000',
    'line_items[0][price_data][product_data][name]': '25-minute text session with <Ada>',
    client_reference_id: 'booking-1',
    'metadata[booking_id]': 'booking-1',
    customer_email: 'mentee@devmentor.test',
    expires_at: String(NOW + MIN_EXPIRY_SECONDS + 60),
    success_url: 'http://app.test/bookings/booking-1',
    cancel_url: 'http://app.test/m/ada?checkout=cancelled',
    ...overrides,
  });

function api(path, { method = 'GET', body, key = SECRET_KEY, idempotencyKey } = {}) {
  const headers = { authorization: `Bearer ${key}` };
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;

  return fetch(`${stub.url}${path}`, { method, body, headers });
}

async function createSession(overrides, idempotencyKey) {
  const response = await api('/v1/checkout/sessions', { method: 'POST', body: form(overrides), idempotencyKey });

  return { status: response.status, body: await response.json() };
}

const events = async () => (await fetch(`${stub.url}/__stub/events`)).json();

describe('signPayload', () => {
  it('signs like Stripe: HMAC-SHA256 of "t.body"', () => {
    const expected = createHmac('sha256', 'secret').update('42.{"a":1}').digest('hex');

    expect(signPayload('{"a":1}', 'secret', 42)).toBe(`t=42,v1=${expected}`);
    expect(signPayload('{}', 'secret')).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});

describe('Checkout Session API', () => {
  it('creates an open session with a hosted page URL, idempotent by key', async () => {
    const first = await createSession({}, 'checkout-booking-1');
    const again = await createSession({}, 'checkout-booking-1');

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      object: 'checkout.session',
      status: 'open',
      payment_status: 'unpaid',
      client_reference_id: 'booking-1',
      metadata: { booking_id: 'booking-1' },
      amount_total: 15000,
      currency: 'pln',
      expires_at: NOW + MIN_EXPIRY_SECONDS + 60,
    });
    expect(first.body.id).toMatch(/^cs_test_\w+$/);
    expect(first.body.url).toBe(`${stub.url}/pay/${first.body.id}`);
    expect(again.body.id).toBe(first.body.id);
    expect((await createSession()).body.id).not.toBe(first.body.id);
  });

  it('refuses a wrong key with 401', async () => {
    const response = await api('/v1/checkout/sessions', { method: 'POST', body: form(), key: 'sk_test_wrong' });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { type: 'invalid_request_error' } });
  });

  it.each([
    ['a missing URL', { success_url: '' }, 'parameter_missing'],
    ['another mode', { mode: 'subscription' }, 'parameter_missing'],
    ['a zero amount', { 'line_items[0][price_data][unit_amount]': '0' }, 'parameter_missing'],
    ['no currency', { 'line_items[0][price_data][currency]': '' }, 'parameter_missing'],
    ['an expiry under 30 minutes', { expires_at: String(NOW + MIN_EXPIRY_SECONDS - 1) }, 'parameter_invalid_integer'],
  ])('refuses %s with 400', async (_name, overrides, code) => {
    const { status, body } = await createSession(overrides);

    expect(status).toBe(400);
    expect(body.error).toMatchObject({ type: 'invalid_request_error', code });
  });

  it('keeps the metadata empty and the page title blank when no booking id or product name is given', async () => {
    const params = form();
    params.delete('metadata[booking_id]');
    params.delete('line_items[0][price_data][product_data][name]');
    const response = await api('/v1/checkout/sessions', { method: 'POST', body: params });
    const session = await response.json();

    expect(session.metadata).toEqual({});
    expect(await (await fetch(session.url)).text()).toContain('<p data-testid="product"></p>');
  });

  it('retrieves a session, and answers unknown ids and URLs like Stripe', async () => {
    const { body } = await createSession();

    expect(await (await api(`/v1/checkout/sessions/${body.id}`)).json()).toMatchObject({ id: body.id, status: 'open' });
    expect((await api('/v1/checkout/sessions/cs_test_missing')).status).toBe(404);
    expect((await api('/v1/checkout/sessions/cs_test_missing', { method: 'POST' })).status).toBe(404);
    expect((await api(`/v1/checkout/sessions/${body.id}/expire`)).status).toBe(404);
    expect((await api('/v1/other')).status).toBe(404);
    expect((await fetch(`${stub.url}/nothing`)).status).toBe(404);
  });

  it('expires an open session, sends a signed checkout.session.expired, and refuses a second expire with 400', async () => {
    const { body } = await createSession();

    const expired = await api(`/v1/checkout/sessions/${body.id}/expire`, { method: 'POST' });
    expect(await expired.json()).toMatchObject({ status: 'expired', url: null });

    expect(received).toHaveLength(1);
    const delivered = received[0];
    expect(delivered.signature).toBe(signPayload(delivered.body, WEBHOOK_SECRET, NOW));
    expect(JSON.parse(delivered.body)).toMatchObject({
      object: 'event',
      type: 'checkout.session.expired',
      created: NOW,
      data: { object: { id: body.id, status: 'expired' } },
    });

    const again = await api(`/v1/checkout/sessions/${body.id}/expire`, { method: 'POST' });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: { type: 'invalid_request_error' } });
  });
});

describe('hosted page', () => {
  it('shows the product and amount with Pay and Cancel', async () => {
    const { body } = await createSession();
    const page = await fetch(body.url);
    const html = await page.text();

    expect(page.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('25-minute text session with &lt;Ada&gt;');
    expect(html).toContain('PLN 150.00');
    expect(html).toContain(`action="/pay/${body.id}/complete"`);
    expect(html).toContain(`action="/pay/${body.id}/cancel"`);
  });

  it('Pay completes the session, delivers a signed checkout.session.completed and redirects to success_url', async () => {
    const { body } = await createSession();
    const response = await fetch(`${body.url}/complete`, { method: 'POST', redirect: 'manual' });

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://app.test/bookings/booking-1');
    expect(JSON.parse(received[0].body)).toMatchObject({
      type: 'checkout.session.completed',
      data: { object: { id: body.id, status: 'complete', payment_status: 'paid', client_reference_id: 'booking-1' } },
    });
    expect(await events()).toEqual([
      { id: expect.stringMatching(/^evt_\w+$/), type: 'checkout.session.completed', deliveries: [200], sessionId: body.id },
    ]);
    expect((await fetch(body.url)).status).toBe(404);
  });

  it('Cancel redirects to cancel_url and leaves the session open', async () => {
    const { body } = await createSession();
    const response = await fetch(`${body.url}/cancel`, { method: 'POST', redirect: 'manual' });

    expect(response.headers.get('location')).toBe('http://app.test/m/ada?checkout=cancelled');
    expect(received).toHaveLength(0);
    expect((await fetch(body.url)).status).toBe(200);
  });

  it('answers 404 for an unknown session or a GET on an action', async () => {
    const { body } = await createSession();

    expect((await fetch(`${stub.url}/pay/cs_test_missing`)).status).toBe(404);
    expect((await fetch(`${body.url}/complete`)).status).toBe(404);
    expect((await fetch(body.url, { method: 'POST' })).status).toBe(404);
  });
});

describe('Refund API', () => {
  async function paidSession() {
    const { body } = await createSession();
    await fetch(`${body.url}/complete`, { method: 'POST', redirect: 'manual' });

    return (await (await api(`/v1/checkout/sessions/${body.id}`)).json());
  }

  const refund = (fields, idempotencyKey) =>
    api('/v1/refunds', { method: 'POST', body: new URLSearchParams(fields), idempotencyKey }).then(async (response) => ({
      status: response.status,
      body: await response.json(),
    }));

  it('gives a paid session a PaymentIntent and refunds it in full, idempotent by key', async () => {
    const session = await paidSession();
    expect(session.payment_intent).toMatch(/^pi_test_\w+$/);

    const first = await refund({ payment_intent: session.payment_intent, 'metadata[booking_id]': 'booking-1' }, 'refund-booking-1');
    const again = await refund({ payment_intent: session.payment_intent, 'metadata[booking_id]': 'booking-1' }, 'refund-booking-1');

    expect(first).toEqual({
      status: 200,
      body: {
        id: expect.stringMatching(/^re_test_\w+$/),
        object: 'refund',
        status: 'succeeded',
        amount: 15000,
        currency: 'pln',
        payment_intent: session.payment_intent,
        metadata: { booking_id: 'booking-1' },
      },
    });
    expect(again.body).toEqual(first.body);
    expect(await (await api(`/v1/refunds/${first.body.id}`)).json()).toEqual(first.body);
    expect(await (await fetch(`${stub.url}/__stub/refunds`)).json()).toEqual([first.body]);
  });

  it('refuses a second refund without the key, an unknown PaymentIntent and an unknown refund like Stripe', async () => {
    const session = await paidSession();
    await refund({ payment_intent: session.payment_intent });

    expect((await refund({ payment_intent: session.payment_intent })).body.error.code).toBe('charge_already_refunded');
    expect((await refund({ payment_intent: 'pi_test_missing' })).body.error.code).toBe('resource_missing');
    expect((await refund({})).status).toBe(400);
    expect((await api('/v1/refunds/re_test_missing')).status).toBe(404);
  });

  it('fails the next new refund on request, then refunds again', async () => {
    const session = await paidSession();
    expect((await fetch(`${stub.url}/__stub/refunds/fail-next`, { method: 'POST' })).status).toBe(200);

    const failed = await refund({ payment_intent: session.payment_intent });
    expect(failed).toMatchObject({ status: 400, body: { error: { code: 'charge_disputed' } } });
    expect((await refund({ payment_intent: session.payment_intent })).status).toBe(200);
  });
});

describe('Connect and transfers', () => {
  const post = (path, fields, idempotencyKey) =>
    api(path, { method: 'POST', body: new URLSearchParams(fields), idempotencyKey }).then(async (response) => ({ status: response.status, body: await response.json() }));

  async function paid() {
    const { body } = await createSession();
    await fetch(`${body.url}/complete`, { method: 'POST', redirect: 'manual' });

    return (await api(`/v1/checkout/sessions/${body.id}?expand%5B0%5D=payment_intent.latest_charge`)).json();
  }

  it('creates an Express account once per key, onboards it on the hosted page and reads it', async () => {
    const created = await post('/v1/accounts', { type: 'express', country: 'PL', 'capabilities[transfers][requested]': 'true', 'metadata[mentor_profile_id]': 'm-1' }, 'connect-account-m-1');
    const again = await post('/v1/accounts', { type: 'express', country: 'PL' }, 'connect-account-m-1');
    expect(created.body).toMatchObject({ id: expect.stringMatching(/^acct_test_\w+$/), payouts_enabled: false, capabilities: { transfers: 'pending' }, metadata: { mentor_profile_id: 'm-1' } });
    expect(again.body.id).toBe(created.body.id);
    expect((await post('/v1/accounts', { type: 'standard' })).status).toBe(400);

    const link = await post('/v1/account_links', { account: created.body.id, type: 'account_onboarding', return_url: 'http://app.test/r', refresh_url: 'http://app.test/f' });
    expect(link.body.url).toBe(`${stub.url}/connect/${created.body.id}`);
    expect((await post('/v1/account_links', { account: 'acct_test_missing', type: 'account_onboarding' })).status).toBe(400);
    expect(await (await fetch(link.body.url)).text()).toContain('Complete onboarding');

    const done = await fetch(`${link.body.url}/complete`, { method: 'POST', redirect: 'manual' });
    expect(done.headers.get('location')).toBe('http://app.test/r');
    expect(await (await api(`/v1/accounts/${created.body.id}`)).json()).toMatchObject({ payouts_enabled: true, details_submitted: true, capabilities: { transfers: 'active' } });
    expect((await api('/v1/accounts/acct_test_missing')).status).toBe(404);
    expect((await fetch(`${stub.url}/connect/acct_test_missing`)).status).toBe(404);
    expect((await fetch(`${link.body.url}/complete`)).status).toBe(404);
  });

  it('expands the charge of a paid session; a refund and a dispute show on it', async () => {
    const session = await paid();
    expect(session.payment_intent).toMatchObject({ id: expect.stringMatching(/^pi_test_/), latest_charge: { id: expect.stringMatching(/^ch_test_/), amount: 15000, refunded: false, disputed: false } });
    expect(typeof (await (await api(`/v1/checkout/sessions/${session.id}`)).json()).payment_intent).toBe('string');

    await post('/v1/refunds', { payment_intent: session.payment_intent.id });
    await fetch(`${stub.url}/__stub/charges/${session.id}/dispute`, { method: 'POST' });
    const after = await (await api(`/v1/checkout/sessions/${session.id}?expand%5B0%5D=payment_intent.latest_charge`)).json();
    expect(after.payment_intent.latest_charge).toMatchObject({ refunded: true, amount_refunded: 15000, disputed: true });
    expect((await fetch(`${stub.url}/__stub/charges/cs_test_missing/dispute`, { method: 'POST' })).status).toBe(404);
  });

  it('transfers to an enabled account from a known charge, idempotently, and finds it by group', async () => {
    const account = (await post('/v1/accounts', { type: 'express' })).body;
    const charge = (await paid()).payment_intent.latest_charge;
    const fields = { amount: '12000', currency: 'pln', destination: account.id, source_transaction: charge.id, transfer_group: 'booking_b-1', 'metadata[booking_id]': 'b-1' };

    const refused = await post('/v1/transfers', fields, 'payout-b-1-1');
    expect(refused.body.error.code).toBe('insufficient_capabilities_for_transfer');
    expect((await post('/v1/transfers', fields, 'payout-b-1-1')).body).toEqual(refused.body);

    await fetch(`${stub.url}/__stub/accounts/${account.id}/enable`, { method: 'POST' });
    expect((await fetch(`${stub.url}/__stub/accounts/acct_test_missing/enable`, { method: 'POST' })).status).toBe(404);
    const made = await post('/v1/transfers', fields, 'payout-b-1-2');
    expect(made.body).toMatchObject({ id: expect.stringMatching(/^tr_test_/), amount: 12000, destination: account.id, source_transaction: charge.id, transfer_group: 'booking_b-1' });
    expect((await post('/v1/transfers', fields, 'payout-b-1-2')).body.id).toBe(made.body.id);
    expect((await post('/v1/transfers', { ...fields, amount: '1' }, 'payout-b-1-2')).body.error.type).toBe('idempotency_error');
    expect((await post('/v1/transfers', { ...fields, amount: '99999' }, 'payout-b-1-3')).body.error.code).toBe('parameter_invalid_integer');

    expect((await (await api('/v1/transfers?transfer_group=booking_b-1')).json()).data.map((transfer) => transfer.id)).toEqual([made.body.id]);
    expect(await (await fetch(`${stub.url}/__stub/transfers`)).json()).toHaveLength(1);
  });

  it('drops the next answer after making the transfer, or refuses the next one, on request', async () => {
    const account = (await post('/v1/accounts', { type: 'express' })).body;
    await fetch(`${stub.url}/__stub/accounts/${account.id}/enable`, { method: 'POST' });
    const charge = (await paid()).payment_intent.latest_charge;
    const fields = { amount: '100', currency: 'pln', destination: account.id, source_transaction: charge.id, transfer_group: 'booking_b-2' };

    await fetch(`${stub.url}/__stub/transfers/drop-next`, { method: 'POST' });
    expect((await post('/v1/transfers', fields, 'payout-b-2-1')).status).toBe(500);
    expect((await (await api('/v1/transfers?transfer_group=booking_b-2')).json()).data).toHaveLength(1);

    await fetch(`${stub.url}/__stub/transfers/fail-next`, { method: 'POST' });
    expect((await post('/v1/transfers', fields, 'payout-b-2-9')).body.error.code).toBe('transfers_not_allowed');
  });
});

describe('test control', () => {
  it('records the receiver status, and resends an event on request', async () => {
    receiverStatus = 500;
    const { body } = await createSession();
    await fetch(`${body.url}/complete`, { method: 'POST', redirect: 'manual' });
    const [event] = await events();

    expect(event.deliveries).toEqual([500]);

    receiverStatus = 200;
    const resend = await fetch(`${stub.url}/__stub/events/${event.id}/resend`, { method: 'POST' });
    expect(await resend.json()).toEqual({ id: event.id, deliveries: [500, 200] });
    expect(received).toHaveLength(2);
    expect(received[1].body).toBe(received[0].body);

    expect((await fetch(`${stub.url}/__stub/events/evt_missing/resend`, { method: 'POST' })).status).toBe(404);
  });

  it('records 0 when the app is unreachable', async () => {
    await new Promise((done) => receiver.server.close(() => done()));
    receiver.server = createServer();
    receiver.server.listen(0);
    const { body } = await createSession();
    await fetch(`${body.url}/complete`, { method: 'POST', redirect: 'manual' });

    expect((await events())[0].deliveries).toEqual([0]);
  });

  it('answers 500 with the message when the handler throws', async () => {
    stub.state.sessions.get = () => {
      throw new Error('broken state');
    };
    const response = await api('/v1/checkout/sessions/cs_test_x');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: 'broken state' });
  });
});

describe('startStripeStub', () => {
  it('uses the real clock by default and rejects when the port is taken', async () => {
    const other = await startStripeStub({ secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET, webhookUrl: receiver.url });
    const port = Number(new URL(other.url).port);
    const before = Math.floor(Date.now() / 1000);

    const response = await fetch(`${other.url}/v1/checkout/sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET_KEY}` },
      body: form({ expires_at: String(before + MIN_EXPIRY_SECONDS + 120) }),
    });
    expect(response.status).toBe(200);

    await expect(
      startStripeStub({ port, secretKey: SECRET_KEY, webhookSecret: WEBHOOK_SECRET, webhookUrl: receiver.url }),
    ).rejects.toThrow(/EADDRINUSE/);
    await other.close();
  });
});
