import { describe, expect, it, vi } from 'vitest';
import type { StripeClient, StripeOutcome, StripeRequest } from './stripe-client';
import { stripeCheckoutSessionSchema, StripeCheckoutGateway } from './stripe-checkout-gateway';

const RAW_SESSION = {
  id: 'cs_test_1',
  object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/cs_test_1',
  status: 'open',
  payment_status: 'unpaid',
  expires_at: 1_800_000_000,
  client_reference_id: 'booking-1',
  amount_total: 15000,
  currency: 'pln',
  customer_details: { email: 'mentee@example.test' },
};

function setup(...outcomes: StripeOutcome<unknown>[]) {
  const request = vi.fn(async (req: StripeRequest<unknown>) => {
    const next = outcomes.shift() ?? { kind: 'retryable' };

    return next.kind === 'ok' ? { kind: 'ok' as const, data: req.schema.parse(next.data) } : next;
  });
  const client = { configured: true, request } as unknown as StripeClient;

  return { gateway: new StripeCheckoutGateway({ stripeClient: client }), request };
}

describe('stripeCheckoutSessionSchema', () => {
  it('normalizes a session and drops everything else', () => {
    expect(stripeCheckoutSessionSchema.parse(RAW_SESSION)).toEqual({
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      status: 'open',
      paymentStatus: 'unpaid',
      expiresAt: new Date(1_800_000_000_000),
      clientReferenceId: 'booking-1',
      amountTotal: 15000,
      currency: 'PLN',
    });
  });

  it('maps missing optional fields to null', () => {
    expect(
      stripeCheckoutSessionSchema.parse({ id: 'cs_2', status: 'complete', payment_status: 'paid', expires_at: 1, currency: null }),
    ).toMatchObject({ url: null, clientReferenceId: null, amountTotal: null, currency: null });
  });
});

describe('StripeCheckoutGateway', () => {
  it('reports the client configuration', () => {
    expect(setup().gateway.configured).toBe(true);
  });

  it('creates a card-only payment session idempotent by booking id', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: RAW_SESSION });

    const result = await gateway.createSession({
      bookingId: 'booking-1',
      amountCents: 15000,
      currency: 'PLN',
      productName: '25-minute text session with Ada',
      customerEmail: 'mentee@example.test',
      expiresAt: new Date('2026-11-20T12:31:00.900Z'),
      successUrl: 'https://app.test/bookings/booking-1',
      cancelUrl: 'https://app.test/m/ada?checkout=cancelled',
    });

    expect(result).toMatchObject({ kind: 'ok', data: { id: 'cs_test_1', status: 'open' } });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v1/checkout/sessions',
        idempotencyKey: 'checkout-booking-1',
        params: {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              quantity: 1,
              price_data: { currency: 'pln', unit_amount: 15000, product_data: { name: '25-minute text session with Ada' } },
            },
          ],
          client_reference_id: 'booking-1',
          metadata: { booking_id: 'booking-1' },
          customer_email: 'mentee@example.test',
          expires_at: Math.floor(new Date('2026-11-20T12:31:00.900Z').getTime() / 1000),
          success_url: 'https://app.test/bookings/booking-1',
          cancel_url: 'https://app.test/m/ada?checkout=cancelled',
        },
      }),
    );
  });

  it('expires an open session', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: { ...RAW_SESSION, status: 'expired', url: null } });

    await expect(gateway.expireSession('cs_test_1')).resolves.toMatchObject({ kind: 'ok', data: { status: 'expired' } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/v1/checkout/sessions/cs_test_1/expire' });
  });

  it('reads the final state when Stripe refuses to expire a session that is no longer open', async () => {
    const { gateway, request } = setup(
      { kind: 'rejected', status: 400, code: null },
      { kind: 'ok', data: { ...RAW_SESSION, status: 'complete', payment_status: 'paid', url: null } },
    );

    await expect(gateway.expireSession('cs/../x')).resolves.toMatchObject({
      kind: 'ok',
      data: { status: 'complete', paymentStatus: 'paid' },
    });
    expect(request.mock.calls[1][0]).toMatchObject({ method: 'GET', path: '/v1/checkout/sessions/cs%2F..%2Fx' });
  });

  it('passes any other failure through', async () => {
    const { gateway, request } = setup({ kind: 'rejected', status: 404, code: 'resource_missing' });

    await expect(gateway.expireSession('cs_x')).resolves.toEqual({ kind: 'rejected', status: 404, code: 'resource_missing' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
