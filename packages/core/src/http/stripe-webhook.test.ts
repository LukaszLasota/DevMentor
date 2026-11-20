import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiHandler } from './apiHandler';
import { ServiceUnavailableError, ValidationError } from './errors';
import { receiveStripeWebhook, STRIPE_WEBHOOK_RESPONSE } from './stripe-webhook';

// The real apiHandler (no CSRF, envelope, error mapping, headers) with a fake inbox: its rules are
// tested in `stripe-inbox.service.test.ts` and against PostgreSQL in the integration suite.
const scope = vi.hoisted(() => ({ cradle: undefined as unknown }));

vi.mock('../container/container', () => ({
  withScope: <T>(fn: (c: unknown) => Promise<T>) => fn(scope.cradle),
}));

const BODY = '{"id":"evt_1",  "type":"checkout.session.completed"}';
const noParams = { params: Promise.resolve({}) };
const POST = apiHandler(receiveStripeWebhook, STRIPE_WEBHOOK_RESPONSE);

const request = (headers: Record<string, string> = { 'stripe-signature': 't=1,v1=abc' }) =>
  new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: BODY, headers });

let receive: ReturnType<typeof vi.fn>;

beforeEach(() => {
  receive = vi.fn(async () => 'processed');
  scope.cradle = { stripeInboxService: { receive }, logger: { error: vi.fn() } };
});

describe('receiveStripeWebhook', () => {
  it('passes the exact bytes and the signature header to the inbox, without a CSRF header, and answers 200', async () => {
    const response = await POST(request(), noParams);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { received: true } });
    expect(receive).toHaveBeenCalledWith(BODY, 't=1,v1=abc');
  });

  it('passes a missing signature as null', async () => {
    await POST(request({}), noParams);

    expect(receive).toHaveBeenCalledWith(BODY, null);
  });

  it('answers 400 for a refused signature and 503 when not configured', async () => {
    receive.mockRejectedValueOnce(new ValidationError('Invalid Stripe signature.'));
    expect((await POST(request(), noParams)).status).toBe(400);

    receive.mockRejectedValueOnce(new ServiceUnavailableError('Stripe webhooks are not configured.'));
    expect((await POST(request(), noParams)).status).toBe(503);
  });

  it('answers 500 when processing failed, so Stripe redelivers', async () => {
    receive.mockRejectedValueOnce(new Error('handler failed'));
    const response = await POST(request(), noParams);

    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(await response.json())).not.toContain('handler failed');
  });
});
