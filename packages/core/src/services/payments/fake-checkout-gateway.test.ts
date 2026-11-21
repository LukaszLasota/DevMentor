import { describe, expect, it } from 'vitest';
import type { CheckoutSessionInput } from './checkout-gateway';
import { FakeCheckoutGateway } from './fake-checkout-gateway';

const INPUT: CheckoutSessionInput = {
  bookingId: 'b-1',
  amountCents: 15000,
  currency: 'pln',
  productName: 'session',
  expiresAt: new Date('2026-11-20T12:31:00Z'),
  successUrl: 'https://app.test/ok',
  cancelUrl: 'https://app.test/cancel',
};

describe('FakeCheckoutGateway', () => {
  it('creates one open session per booking and records the input', async () => {
    const gateway = new FakeCheckoutGateway();

    const first = await gateway.createSession(INPUT);
    const again = await gateway.createSession(INPUT);

    expect(gateway.configured).toBe(true);
    expect(first).toEqual({
      kind: 'ok',
      data: {
        id: 'cs_fake_b-1',
        url: 'https://checkout.fake.test/cs_fake_b-1',
        status: 'open',
        paymentStatus: 'unpaid',
        expiresAt: INPUT.expiresAt,
        clientReferenceId: 'b-1',
        amountTotal: 15000,
        currency: 'PLN',
        paymentIntentId: null,
      },
    });
    expect(again).toEqual(first);
    expect(gateway.created).toHaveLength(2);
  });

  it('answers the scripted failure once', async () => {
    const gateway = new FakeCheckoutGateway();
    gateway.nextFailure = { kind: 'retryable' };

    await expect(gateway.createSession(INPUT)).resolves.toEqual({ kind: 'retryable' });
    await expect(gateway.createSession(INPUT)).resolves.toMatchObject({ kind: 'ok' });

    gateway.nextFailure = { kind: 'misconfigured' };
    await expect(gateway.expireSession('cs_fake_b-1')).resolves.toEqual({ kind: 'misconfigured' });
  });

  it('expires an open session and returns a completed one unchanged', async () => {
    const gateway = new FakeCheckoutGateway();
    await gateway.createSession(INPUT);
    await gateway.createSession({ ...INPUT, bookingId: 'b-2' });

    await expect(gateway.expireSession('cs_fake_b-1')).resolves.toMatchObject({ kind: 'ok', data: { status: 'expired', url: null } });

    expect(gateway.complete('cs_fake_b-2')).toMatchObject({ status: 'complete', paymentStatus: 'paid', url: null });
    await expect(gateway.expireSession('cs_fake_b-2')).resolves.toMatchObject({ kind: 'ok', data: { status: 'complete' } });
  });

  it('rejects an unknown session and refuses to complete one that is not open', async () => {
    const gateway = new FakeCheckoutGateway();
    await gateway.createSession(INPUT);
    await gateway.expireSession('cs_fake_b-1');

    await expect(gateway.expireSession('cs_missing')).resolves.toEqual({ kind: 'rejected', status: 404, code: 'resource_missing' });
    expect(() => gateway.complete('cs_fake_b-1')).toThrow(/No open fake session/);
    expect(() => gateway.complete('cs_missing')).toThrow(/No open fake session/);
  });

  it('refunds a paid session once per booking, with a scripted status, and reads it back', async () => {
    const gateway = new FakeCheckoutGateway();
    await gateway.createSession(INPUT);
    expect(gateway.complete('cs_fake_b-1').paymentIntentId).toBe('pi_fake_b-1');
    gateway.nextRefundStatus = 'pending';

    const first = await gateway.refund({ bookingId: 'b-1', sessionId: 'cs_fake_b-1' });
    gateway.nextRefundStatus = 'failed';
    const again = await gateway.refund({ bookingId: 'b-1', sessionId: 'cs_fake_b-1' });

    expect(first).toEqual({ kind: 'ok', data: { id: 're_fake_b-1', status: 'pending' } });
    expect(again).toEqual(first);
    expect(gateway.refunds.size).toBe(1);
    await expect(gateway.getRefund('re_fake_b-1')).resolves.toEqual(first);
    await expect(gateway.getRefund('re_missing')).resolves.toEqual({ kind: 'rejected', status: 404, code: 'resource_missing' });
  });

  it('refuses to refund an unpaid or unknown session and answers scripted failures', async () => {
    const gateway = new FakeCheckoutGateway();
    await gateway.createSession(INPUT);

    await expect(gateway.refund({ bookingId: 'b-1', sessionId: 'cs_fake_b-1' })).resolves.toEqual({
      kind: 'rejected',
      status: 400,
      code: 'payment_intent_missing',
    });
    await expect(gateway.refund({ bookingId: 'b-1', sessionId: 'cs_missing' })).resolves.toMatchObject({ kind: 'rejected' });

    gateway.nextFailure = { kind: 'retryable' };
    await expect(gateway.refund({ bookingId: 'b-1', sessionId: 'cs_fake_b-1' })).resolves.toEqual({ kind: 'retryable' });
    gateway.nextFailure = { kind: 'retryable' };
    await expect(gateway.getRefund('re_fake_b-1')).resolves.toEqual({ kind: 'retryable' });
  });

  it('reads the charge of a paid session, with the state a test set, and null before payment', async () => {
    const gateway = new FakeCheckoutGateway();
    await gateway.createSession(INPUT);

    await expect(gateway.chargeOf('cs_fake_b-1')).resolves.toEqual({ kind: 'ok', data: null });
    await expect(gateway.chargeOf('cs_missing')).resolves.toEqual({ kind: 'ok', data: null });
    gateway.complete('cs_fake_b-1');
    await expect(gateway.chargeOf('cs_fake_b-1')).resolves.toEqual({ kind: 'ok', data: { id: 'ch_fake_b-1', refunded: false, amountRefunded: 0, disputed: false } });
    gateway.chargeChanges.set('cs_fake_b-1', { disputed: true });
    await expect(gateway.chargeOf('cs_fake_b-1')).resolves.toMatchObject({ data: { disputed: true } });
    gateway.nextFailure = { kind: 'retryable' };
    await expect(gateway.chargeOf('cs_fake_b-1')).resolves.toEqual({ kind: 'retryable' });
  });
});
