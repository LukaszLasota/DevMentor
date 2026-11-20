// Local Stripe Checkout stub for integration tests (spec 2026-11-20-booking-stripe-checkout): no
// network, no keys. The app reaches it through STRIPE_API_URL, which it accepts only with
// ALLOW_TEST_OVERRIDES=1. It serves the Checkout Session calls `StripeCheckoutGateway` makes, a
// hosted page whose Pay / Cancel buttons act like the mentee on Stripe, and delivers signed webhooks
// (`checkout.session.completed` / `checkout.session.expired`) to the app the way Stripe does.
//
// Test control (other processes, e.g. Vitest workers): `GET /__stub/events` lists every event and
// its delivery status; `POST /__stub/events/<id>/resend` delivers it again (a Stripe redelivery).
import { createHmac, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

/** Stripe refuses an `expires_at` sooner than this. */
export const MIN_EXPIRY_SECONDS = 30 * 60;

/** `t=<unix>,v1=<hex>`: the `Stripe-Signature` header for a body (same scheme as Stripe). */
export function signPayload(body, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

const id = (prefix) => `${prefix}_${randomBytes(12).toString('hex')}`;

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function stripeError(res, status, type, message, code) {
  sendJson(res, status, { error: { type, message, ...(code ? { code } : {}) } });
}

async function readBody(req) {
  let body = '';

  for await (const chunk of req) body += chunk;

  return body;
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function payPage(session, productName) {
  const amount = `${session.currency.toUpperCase()} ${(session.amount_total / 100).toFixed(2)}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Stripe stub checkout</title></head><body>
<h1>Stripe stub checkout</h1>
<p data-testid="product">${escapeHtml(productName)}</p>
<p data-testid="amount">${escapeHtml(amount)}</p>
<form method="post" action="/pay/${session.id}/complete"><button type="submit">Pay</button></form>
<form method="post" action="/pay/${session.id}/cancel"><button type="submit">Cancel</button></form>
</body></html>`;
}

/** A copy of the public shape of a session (what Stripe returns). */
const view = (session) => ({ ...session });

/**
 * Request handler of the stub, plus its in-memory state.
 * @param {{ secretKey: string, webhookSecret: string, webhookUrl: string, now?: () => number }} options
 *   `now` returns unix seconds (tests pin it).
 */
export function createStripeStub({ secretKey, webhookSecret, webhookUrl, now = () => Math.floor(Date.now() / 1000) }) {
  const sessions = new Map();
  /** Line item name per session id: shown on the hosted page, not part of Stripe's session object. */
  const productNames = new Map();
  const byIdempotencyKey = new Map();
  const events = [];

  async function deliver(event) {
    const body = JSON.stringify(event.payload);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'stripe-signature': signPayload(body, webhookSecret, now()) },
        body,
      });
      event.deliveries.push(response.status);
    } catch {
      event.deliveries.push(0);
    }

    return event;
  }

  function emit(type, session) {
    const event = {
      id: id('evt'),
      type,
      deliveries: [],
      payload: { id: '', object: 'event', type, created: now(), livemode: false, data: { object: view(session) } },
    };
    event.payload.id = event.id;
    events.push(event);

    return deliver(event);
  }

  function createSession(form, idempotencyKey, origin) {
    if (idempotencyKey && byIdempotencyKey.has(idempotencyKey)) {
      return { status: 200, body: view(sessions.get(byIdempotencyKey.get(idempotencyKey))) };
    }

    const amount = Number(form.get('line_items[0][price_data][unit_amount]'));
    const currency = form.get('line_items[0][price_data][currency]');
    const expiresAt = Number(form.get('expires_at'));
    const required = ['success_url', 'cancel_url', 'client_reference_id'].filter((key) => !form.get(key));

    if (form.get('mode') !== 'payment' || required.length > 0 || !currency || !Number.isInteger(amount) || amount <= 0) {
      return {
        status: 400,
        error: ['invalid_request_error', `mode=payment, a positive unit_amount, currency and ${required.join(', ') || 'urls'} are required`, 'parameter_missing'],
      };
    }

    if (!Number.isInteger(expiresAt) || expiresAt < now() + MIN_EXPIRY_SECONDS) {
      return { status: 400, error: ['invalid_request_error', 'expires_at must be at least 30 minutes ahead', 'parameter_invalid_integer'] };
    }

    const sessionId = id('cs_test');
    const session = {
      id: sessionId,
      object: 'checkout.session',
      url: `${origin}/pay/${sessionId}`,
      status: 'open',
      payment_status: 'unpaid',
      mode: 'payment',
      expires_at: expiresAt,
      client_reference_id: form.get('client_reference_id'),
      metadata: { booking_id: form.get('metadata[booking_id]') ?? undefined },
      customer_email: form.get('customer_email'),
      amount_total: amount,
      currency,
      success_url: form.get('success_url'),
      cancel_url: form.get('cancel_url'),
    };
    sessions.set(sessionId, session);
    productNames.set(sessionId, form.get('line_items[0][price_data][product_data][name]') ?? '');

    if (idempotencyKey) byIdempotencyKey.set(idempotencyKey, sessionId);

    return { status: 200, body: view(session) };
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /__stub/events') {
      sendJson(res, 200, events.map(({ id: eventId, type, deliveries, payload }) => ({ id: eventId, type, deliveries, sessionId: payload.data.object.id })));
      return;
    }

    const resend = /^POST \/__stub\/events\/(evt_\w+)\/resend$/.exec(route);

    if (resend) {
      const event = events.find((candidate) => candidate.id === resend[1]);

      if (!event) {
        sendJson(res, 404, { message: 'No such event' });
        return;
      }

      const { deliveries } = await deliver(event);
      sendJson(res, 200, { id: event.id, deliveries });
      return;
    }

    const page = /^(GET|POST) \/pay\/(cs_test_\w+)(?:\/(complete|cancel))?$/.exec(route);

    if (page) {
      const session = sessions.get(page[2]);

      if (!session || session.status !== 'open' || (page[1] === 'GET') !== (page[3] === undefined)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('This checkout session is no longer open.');
        return;
      }

      if (page[1] === 'GET') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(payPage(session, productNames.get(session.id)));
        return;
      }

      if (page[3] === 'complete') {
        Object.assign(session, { status: 'complete', payment_status: 'paid', url: null });
        await emit('checkout.session.completed', session);
      }

      res.writeHead(303, { location: page[3] === 'complete' ? session.success_url : session.cancel_url });
      res.end();
      return;
    }

    if (!url.pathname.startsWith('/v1/')) {
      sendJson(res, 404, { message: 'Not Found' });
      return;
    }

    if (req.headers.authorization !== `Bearer ${secretKey}`) {
      stripeError(res, 401, 'invalid_request_error', 'Invalid API Key provided.');
      return;
    }

    if (route === 'POST /v1/checkout/sessions') {
      const result = createSession(new URLSearchParams(await readBody(req)), req.headers['idempotency-key'], url.origin);

      if (result.error) stripeError(res, result.status, ...result.error);
      else sendJson(res, result.status, result.body);
      return;
    }

    const sessionRoute = /^(GET|POST) \/v1\/checkout\/sessions\/(cs_test_\w+)(\/expire)?$/.exec(route);
    const session = sessionRoute ? sessions.get(sessionRoute[2]) : undefined;

    if (!sessionRoute || (sessionRoute[1] === 'GET') !== (sessionRoute[3] === undefined)) {
      sendJson(res, 404, { error: { type: 'invalid_request_error', message: 'Unrecognized request URL.' } });
    } else if (!session) {
      stripeError(res, 404, 'invalid_request_error', 'No such checkout.session', 'resource_missing');
    } else if (sessionRoute[1] === 'GET') {
      sendJson(res, 200, view(session));
    } else if (session.status !== 'open') {
      stripeError(res, 400, 'invalid_request_error', `Only Checkout Sessions with a status of open can be expired.`);
    } else {
      Object.assign(session, { status: 'expired', url: null });
      await emit('checkout.session.expired', session);
      sendJson(res, 200, view(session));
    }
  }

  return { handle, sessions, events };
}

/**
 * Starts the stub; resolves with its base URL (STRIPE_API_URL) and a `close`. Port 0 picks a free port.
 * @param {{ port?: number, host?: string, secretKey: string, webhookSecret: string, webhookUrl: string, now?: () => number }} options
 */
export function startStripeStub({ port = 0, host = '127.0.0.1', ...options }) {
  const stub = createStripeStub(options);
  const server = createServer((req, res) => {
    stub.handle(req, res).catch((error) => sendJson(res, 500, { message: error.message }));
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        url: `http://${host}:${server.address().port}`,
        state: stub,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}
