import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiHandler } from './apiHandler';
import { ServiceUnavailableError, ValidationError } from './errors';
import { receiveStripeWebhook, STRIPE_WEBHOOK_MAX_BYTES, STRIPE_WEBHOOK_RESPONSE } from './stripe-webhook';

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

  it('refuses a missing or blank signature with 400 without reading the body', async () => {
    for (const headers of [{}, { 'stripe-signature': ' ' }] as Record<string, string>[]) {
      const req = request(headers);
      const response = await POST(req, noParams);

      expect(response.status).toBe(400);
      expect(req.bodyUsed).toBe(false);
    }

    expect(receive).not.toHaveBeenCalled();
  });

  it('refuses a declared Content-Length over the limit without reading the body', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: BODY,
      headers: { 'stripe-signature': 't=1,v1=abc', 'content-length': String(STRIPE_WEBHOOK_MAX_BYTES + 1) },
    });

    expect((await POST(req, noParams)).status).toBe(400);
    expect(receive).not.toHaveBeenCalled();
  });

  it('stops reading a streamed body once it passes the limit', async () => {
    const chunk = new Uint8Array(64 * 1024).fill(97);
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body,
      headers: { 'stripe-signature': 't=1,v1=abc' },
      duplex: 'half',
    } as RequestInit);

    expect((await POST(req, noParams)).status).toBe(400);
    expect(receive).not.toHaveBeenCalled();
    expect(pulled).toBeLessThan(20);
  });

  it('passes an empty body as an empty string and multi-byte text intact', async () => {
    await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 's' } }), noParams);
    expect(receive).toHaveBeenLastCalledWith('', 's');

    await POST(request({ 'stripe-signature': 's' }), noParams);
    const text = '{"name":"Zażółć ✓"}';
    await POST(new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: text, headers: { 'stripe-signature': 's' } }), noParams);
    expect(receive).toHaveBeenLastCalledWith(text, 's');
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
