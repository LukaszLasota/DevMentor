import { describe, expect, it, vi } from 'vitest';
import type { StripeClient, StripeOutcome, StripeRequest } from './stripe-client';
import { stripeCheckoutSessionSchema, StripeCheckoutGateway, stripeRefundSchema } from './stripe-checkout-gateway';

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
      paymentIntentId: null,
    });
  });

  it('maps missing optional fields to null', () => {
    expect(
      stripeCheckoutSessionSchema.parse({ id: 'cs_2', status: 'complete', payment_status: 'paid', expires_at: 1, currency: null }),
    ).toMatchObject({ url: null, clientReferenceId: null, amountTotal: null, currency: null, paymentIntentId: null });
  });

  it('reads the PaymentIntent as an id or as an expanded object', () => {
    expect(stripeCheckoutSessionSchema.parse({ ...RAW_SESSION, payment_intent: 'pi_1' }).paymentIntentId).toBe('pi_1');
    expect(stripeCheckoutSessionSchema.parse({ ...RAW_SESSION, payment_intent: { id: 'pi_2', object: 'payment_intent' } }).paymentIntentId).toBe('pi_2');
    expect(stripeCheckoutSessionSchema.parse({ ...RAW_SESSION, payment_intent: null }).paymentIntentId).toBeNull();
  });
});

describe('stripeRefundSchema', () => {
  it.each([
    ['pending', 'pending'],
    ['requires_action', 'pending'],
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
  ])('folds Stripe %s into %s', (stripe, ours) => {
    expect(stripeRefundSchema.parse({ id: 're_1', object: 'refund', status: stripe, amount: 15000 })).toEqual({ id: 're_1', status: ours });
  });
});

describe('StripeCheckoutGateway.refund', () => {
  const PAID = { ...RAW_SESSION, status: 'complete', payment_status: 'paid', url: null, payment_intent: 'pi_1' };

  it('reads the session, then refunds its PaymentIntent in full, idempotent by booking id', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: PAID }, { kind: 'ok', data: { id: 're_1', status: 'succeeded' } });

    await expect(gateway.refund({ bookingId: 'booking-1', sessionId: 'cs_test_1' })).resolves.toEqual({ kind: 'ok', data: { id: 're_1', status: 'succeeded' } });
    expect(request.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', path: '/v1/checkout/sessions/cs_test_1' });
    expect(request.mock.calls[1]?.[0]).toMatchObject({
      method: 'POST',
      path: '/v1/refunds',
      idempotencyKey: 'refund-booking-1',
      params: { payment_intent: 'pi_1', metadata: { booking_id: 'booking-1' } },
    });
    expect(request.mock.calls[1]?.[0].params).not.toHaveProperty('amount');
  });

  it('passes a failed session read through and refuses a session without a PaymentIntent', async () => {
    await expect(setup({ kind: 'retryable' }).gateway.refund({ bookingId: 'b', sessionId: 'cs' })).resolves.toEqual({ kind: 'retryable' });

    const unpaid = setup({ kind: 'ok', data: RAW_SESSION });
    await expect(unpaid.gateway.refund({ bookingId: 'b', sessionId: 'cs' })).resolves.toEqual({
      kind: 'rejected',
      status: 400,
      code: 'payment_intent_missing',
    });
    expect(unpaid.request).toHaveBeenCalledTimes(1);
  });

  it('treats an already refunded charge as succeeded and passes other outcomes through', async () => {
    const already = setup({ kind: 'ok', data: PAID }, { kind: 'rejected', status: 400, code: 'charge_already_refunded' });
    await expect(already.gateway.refund({ bookingId: 'b', sessionId: 'cs' })).resolves.toEqual({ kind: 'ok', data: { id: null, status: 'succeeded' } });

    const other = setup({ kind: 'ok', data: PAID }, { kind: 'rejected', status: 400, code: 'charge_disputed' });
    await expect(other.gateway.refund({ bookingId: 'b', sessionId: 'cs' })).resolves.toEqual({ kind: 'rejected', status: 400, code: 'charge_disputed' });

    const down = setup({ kind: 'ok', data: PAID }, { kind: 'retryable' });
    await expect(down.gateway.refund({ bookingId: 'b', sessionId: 'cs' })).resolves.toEqual({ kind: 'retryable' });
  });

  it('reads a refund by id', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: { id: 're_1', status: 'pending' } });

    await expect(gateway.getRefund('re_1')).resolves.toEqual({ kind: 'ok', data: { id: 're_1', status: 'pending' } });
    expect(request.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', path: '/v1/refunds/re_1' });
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

  it('returns a session that is still open when the 400 had another cause', async () => {
    const { gateway } = setup({ kind: 'rejected', status: 400, code: 'parameter_unknown' }, { kind: 'ok', data: RAW_SESSION });

    await expect(gateway.expireSession('cs_test_1')).resolves.toMatchObject({ kind: 'ok', data: { status: 'open' } });
  });

  it('passes any other failure through', async () => {
    const { gateway, request } = setup({ kind: 'rejected', status: 404, code: 'resource_missing' });

    await expect(gateway.expireSession('cs_x')).resolves.toEqual({ kind: 'rejected', status: 404, code: 'resource_missing' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
