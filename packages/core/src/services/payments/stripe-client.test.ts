import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseEnv } from '../../config/env';
import type { Cradle } from '../../container/cradle';
import { ServiceUnavailableError, ValidationError } from '../../http/errors';
import type { FetchJsonInit, UpstreamResponse } from '../../http/outbound';
import { encodeStripeForm, STRIPE_API_VERSION, StripeClient } from './stripe-client';

const SECRET = 'sk_test_the-secret-key';
const schema = z.object({ id: z.string() });

function setup(respond: () => Promise<UpstreamResponse>, envOverrides: Record<string, string> = {}) {
  const env = parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', STRIPE_SECRET_KEY: SECRET, ...envOverrides });
  const fetchJson = vi.fn<(url: URL, init: FetchJsonInit) => Promise<UpstreamResponse>>(() => respond());
  const logger = { warn: vi.fn() };
  const client = new StripeClient({
    env,
    fetchJson: fetchJson as unknown as Cradle['fetchJson'],
    logger: logger as unknown as Cradle['logger'],
  });

  return { client, fetchJson, logger };
}

const reply = (status: number, body: unknown) => async () => ({ status, body });
const stripeError = (type: string, code?: string) => ({ error: { type, code, message: 'card 4242 secret detail' } });

describe('encodeStripeForm', () => {
  it('encodes nested objects and arrays with bracket keys and skips undefined', () => {
    const form = encodeStripeForm({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'pln', unit_amount: 15000 } }],
      payment_method_types: ['card'],
      metadata: { booking_id: 'b-1' },
      livemode: false,
      skipped: undefined,
    });

    expect(decodeURIComponent(form)).toBe(
      'mode=payment&line_items[0][quantity]=1&line_items[0][price_data][currency]=pln&line_items[0][price_data][unit_amount]=15000&payment_method_types[0]=card&metadata[booking_id]=b-1&livemode=false',
    );
  });
});

describe('StripeClient.request', () => {
  it('posts a form with bearer key, pinned version and idempotency key, and returns ok with parsed data', async () => {
    const { client, fetchJson } = setup(reply(200, { id: 'cs_1', extra: 'ignored' }));

    expect(client.configured).toBe(true);
    await expect(
      client.request({ method: 'POST', path: '/v1/checkout/sessions', params: { mode: 'payment' }, idempotencyKey: 'key-1', schema }),
    ).resolves.toEqual({ kind: 'ok', data: { id: 'cs_1' } });

    const [url, init] = fetchJson.mock.calls[0];
    expect(url.href).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(init).toMatchObject({ method: 'POST', body: 'mode=payment', withStatus: true });
    expect(init.headers).toEqual({
      authorization: `Bearer ${SECRET}`,
      'stripe-version': STRIPE_API_VERSION,
      'idempotency-key': 'key-1',
      'content-type': 'application/x-www-form-urlencoded',
    });
  });

  it('sends GET parameters in the query, without a body or idempotency key, to the configured base URL', async () => {
    const { client, fetchJson } = setup(reply(200, { id: 'cs_1' }), {
      STRIPE_API_URL: 'http://127.0.0.1:4100',
      ALLOW_TEST_OVERRIDES: '1',
    });

    await client.request({ method: 'GET', path: '/v1/checkout/sessions/cs_1', params: { expand: ['payment_intent'] }, schema });

    const [url, init] = fetchJson.mock.calls[0];
    expect(decodeURIComponent(url.href)).toBe('http://127.0.0.1:4100/v1/checkout/sessions/cs_1?expand[0]=payment_intent');
    expect(init.body).toBeUndefined();
    expect(init.headers).not.toHaveProperty('idempotency-key');
    expect(init.headers).not.toHaveProperty('content-type');
  });

  it('is misconfigured without a secret key and makes no call', async () => {
    const env = parseEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db' });
    const fetchJson = vi.fn();
    const logger = { warn: vi.fn() };
    const client = new StripeClient({
      env,
      fetchJson: fetchJson as unknown as Cradle['fetchJson'],
      logger: logger as unknown as Cradle['logger'],
    });

    expect(client.configured).toBe(false);
    await expect(client.request({ method: 'POST', path: '/v1/x', schema })).resolves.toEqual({ kind: 'misconfigured' });
    expect(fetchJson).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: { method: 'POST', path: '/v1/x' } },
      expect.stringContaining('STRIPE_SECRET_KEY'),
    );
  });

  it.each([
    ['401', 401, stripeError('invalid_request_error'), { kind: 'misconfigured' }],
    ['500', 500, null, { kind: 'retryable' }],
    ['503 with an error body', 503, stripeError('api_error'), { kind: 'retryable' }],
    ['429', 429, stripeError('rate_limit_error'), { kind: 'retryable' }],
    ['409 idempotency_key_in_use', 409, stripeError('idempotency_error', 'idempotency_key_in_use'), { kind: 'retryable' }],
    ['409 lock_timeout', 409, stripeError('invalid_request_error', 'lock_timeout'), { kind: 'retryable' }],
    ['409 other', 409, stripeError('invalid_request_error', 'other'), { kind: 'rejected', status: 409, code: 'other' }],
    ['409 without a code', 409, stripeError('invalid_request_error'), { kind: 'rejected', status: 409, code: null }],
    ['400 idempotency_error', 400, stripeError('idempotency_error'), { kind: 'idempotency_mismatch' }],
    [
      '400 other',
      400,
      stripeError('invalid_request_error', 'parameter_invalid_integer'),
      { kind: 'rejected', status: 400, code: 'parameter_invalid_integer' },
    ],
    ['404 without a body', 404, null, { kind: 'rejected', status: 404, code: null }],
    ['400 with a code but no type', 400, { error: { code: 'resource_missing' } }, { kind: 'rejected', status: 400, code: 'resource_missing' }],
  ])('classifies %s', async (_name, status, body, outcome) => {
    const { client } = setup(reply(status, body));

    await expect(client.request({ method: 'POST', path: '/v1/x', schema })).resolves.toEqual(outcome);
  });

  it('treats an unexpected 2xx body as retryable', async () => {
    const { client, logger } = setup(reply(200, { nope: true }));

    await expect(client.request({ method: 'GET', path: '/v1/x', schema })).resolves.toEqual({ kind: 'retryable' });
    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: { method: 'GET', path: '/v1/x', status: 200 } },
      'Stripe returned an unexpected response',
    );
  });

  it('treats a timeout or network failure as retryable', async () => {
    const { client } = setup(async () => {
      throw new ServiceUnavailableError('An upstream service is unavailable.');
    });

    await expect(client.request({ method: 'POST', path: '/v1/x', schema })).resolves.toEqual({ kind: 'retryable' });
  });

  it('rethrows any other error', async () => {
    const { client } = setup(async () => {
      throw new ValidationError('boom');
    });

    await expect(client.request({ method: 'POST', path: '/v1/x', schema })).rejects.toBeInstanceOf(ValidationError);
  });

  it('logs status and Stripe type/code only — never the key, parameters or error message', async () => {
    const { client, logger } = setup(reply(402, stripeError('card_error', 'card_declined')));

    await client.request({
      method: 'POST',
      path: '/v1/x',
      params: { customer_email: 'mentee@example.test' },
      idempotencyKey: 'k',
      schema,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      { upstream: { method: 'POST', path: '/v1/x', status: 402 }, stripe: { type: 'card_error', code: 'card_declined' } },
      'Stripe rejected the request',
    );
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).not.toMatch(/sk_test|mentee@example|4242|secret detail/);
  });
});
