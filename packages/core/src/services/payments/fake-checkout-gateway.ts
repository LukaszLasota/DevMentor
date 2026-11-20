import type { CheckoutGateway, CheckoutResult, CheckoutSession, CheckoutSessionInput, Refund, RefundInput } from './checkout-gateway';

type Failure = Exclude<CheckoutResult<CheckoutSession>, { kind: 'ok' }>;

/**
 * In-memory Checkout for unit tests: records sessions, lets a test complete one (as if the mentee
 * paid) and script the next failure. Never touches the network.
 */
export class FakeCheckoutGateway implements CheckoutGateway {
  configured = true;
  readonly sessions = new Map<string, CheckoutSession>();
  readonly created: CheckoutSessionInput[] = [];
  /** Refunds by booking id (one per booking, like Stripe's idempotency key). */
  readonly refunds = new Map<string, Refund & { id: string; sessionId: string }>();
  /** The status the next new refund gets (`succeeded` unless a test sets it). */
  nextRefundStatus: Refund['status'] = 'succeeded';
  /** The next call (any method) answers this instead (then it is cleared). */
  nextFailure: Failure | undefined;

  private take(): Failure | undefined {
    const failure = this.nextFailure;
    this.nextFailure = undefined;

    return failure;
  }

  async createSession(input: CheckoutSessionInput): Promise<CheckoutResult<CheckoutSession>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    this.created.push(input);
    const id = `cs_fake_${input.bookingId}`;
    const existing = this.sessions.get(id);

    if (existing) {
      return { kind: 'ok', data: existing };
    }

    const session: CheckoutSession = {
      id,
      url: `https://checkout.fake.test/${id}`,
      status: 'open',
      paymentStatus: 'unpaid',
      expiresAt: input.expiresAt,
      clientReferenceId: input.bookingId,
      amountTotal: input.amountCents,
      currency: input.currency.toUpperCase(),
      paymentIntentId: null,
    };
    this.sessions.set(id, session);

    return { kind: 'ok', data: session };
  }

  async expireSession(sessionId: string): Promise<CheckoutResult<CheckoutSession>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const session = this.sessions.get(sessionId);

    if (!session) {
      return { kind: 'rejected', status: 404, code: 'resource_missing' };
    }

    if (session.status === 'open') {
      session.status = 'expired';
      session.url = null;
    }

    return { kind: 'ok', data: { ...session } };
  }

  async refund({ bookingId, sessionId }: RefundInput): Promise<CheckoutResult<Refund>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    if (this.sessions.get(sessionId)?.paymentIntentId == null) {
      return { kind: 'rejected', status: 400, code: 'payment_intent_missing' };
    }

    const existing = this.refunds.get(bookingId);
    const refund = existing ?? { id: `re_fake_${bookingId}`, status: this.nextRefundStatus, sessionId };
    this.refunds.set(bookingId, refund);

    return { kind: 'ok', data: { id: refund.id, status: refund.status } };
  }

  async getRefund(refundId: string): Promise<CheckoutResult<Refund>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const refund = [...this.refunds.values()].find((candidate) => candidate.id === refundId);

    return refund ? { kind: 'ok', data: { id: refund.id, status: refund.status } } : { kind: 'rejected', status: 404, code: 'resource_missing' };
  }

  /** Simulates a successful payment on the hosted page. */
  complete(sessionId: string): CheckoutSession {
    const session = this.sessions.get(sessionId);

    if (!session || session.status !== 'open') {
      throw new Error(`No open fake session ${sessionId}`);
    }

    session.status = 'complete';
    session.paymentStatus = 'paid';
    session.url = null;
    session.paymentIntentId = `pi_fake_${session.clientReferenceId}`;

    return { ...session };
  }
}
