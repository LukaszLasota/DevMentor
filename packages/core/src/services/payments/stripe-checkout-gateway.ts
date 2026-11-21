import { z } from 'zod';
import type { CheckoutGateway, CheckoutResult, CheckoutSession, CheckoutSessionInput, Refund, RefundInput, SessionCharge } from './checkout-gateway';
import type { StripeClient } from './stripe-client';

/** The fields of a Stripe Checkout Session this platform reads; everything else is dropped. */
export const stripeCheckoutSessionSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().nullable().optional(),
    status: z.enum(['open', 'complete', 'expired']),
    payment_status: z.enum(['paid', 'unpaid', 'no_payment_required']),
    expires_at: z.number().int(),
    client_reference_id: z.string().nullable().optional(),
    amount_total: z.number().int().nullable().optional(),
    currency: z.string().nullable().optional(),
    // An id, or the object when a caller expanded it; webhook payloads carry the id.
    payment_intent: z.union([z.string(), z.object({ id: z.string() })]).nullable().optional(),
  })
  .transform(
    (session): CheckoutSession => ({
      id: session.id,
      url: session.url ?? null,
      status: session.status,
      paymentStatus: session.payment_status,
      expiresAt: new Date(session.expires_at * 1000),
      clientReferenceId: session.client_reference_id ?? null,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ? session.currency.toUpperCase() : null,
      paymentIntentId: typeof session.payment_intent === 'object' ? (session.payment_intent?.id ?? null) : (session.payment_intent ?? null),
    }),
  );

/** A Stripe refund: its five states folded into ours (`requires_action` waits like `pending`). */
export const stripeRefundSchema = z
  .object({ id: z.string().min(1), status: z.enum(['pending', 'requires_action', 'succeeded', 'failed', 'canceled']) })
  .transform(
    (refund): Refund => ({
      id: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : refund.status === 'failed' || refund.status === 'canceled' ? 'failed' : 'pending',
    }),
  );

/** A session read with `expand[]=payment_intent.latest_charge`: only the charge's state is kept. */
export const sessionChargeSchema = z
  .object({
    payment_intent: z
      .object({
        latest_charge: z
          .object({
            id: z.string().min(1),
            refunded: z.boolean().optional(),
            amount_refunded: z.number().int().optional(),
            disputed: z.boolean().optional(),
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .transform((session): SessionCharge | null => {
    const charge = session.payment_intent?.latest_charge;

    return charge
      ? { id: charge.id, refunded: charge.refunded === true, amountRefunded: charge.amount_refunded ?? 0, disputed: charge.disputed === true }
      : null;
  });

const SESSIONS_PATH = '/v1/checkout/sessions';
const REFUNDS_PATH = '/v1/refunds';

/** Checkout over the shared Stripe client: card only (spec Q2), one line item, idempotent by booking id. */
export class StripeCheckoutGateway implements CheckoutGateway {
  private readonly stripeClient: StripeClient;

  constructor({ stripeClient }: { stripeClient: StripeClient }) {
    this.stripeClient = stripeClient;
  }

  get configured(): boolean {
    return this.stripeClient.configured;
  }

  createSession(input: CheckoutSessionInput): Promise<CheckoutResult<CheckoutSession>> {
    return this.stripeClient.request({
      method: 'POST',
      path: SESSIONS_PATH,
      idempotencyKey: `checkout-${input.bookingId}`,
      schema: stripeCheckoutSessionSchema,
      params: {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.productName },
            },
          },
        ],
        client_reference_id: input.bookingId,
        metadata: { booking_id: input.bookingId },
        customer_email: input.customerEmail,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
    });
  }

  async expireSession(sessionId: string): Promise<CheckoutResult<CheckoutSession>> {
    const path = `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`;
    const expired = await this.stripeClient.request({ method: 'POST', path: `${path}/expire`, schema: stripeCheckoutSessionSchema });

    // Stripe answers 400 (invalid_request_error, no specific code) when the session is no longer
    // open. Any 400 is answered by reading the session: the caller gets its real state — `complete`,
    // `expired`, or still `open` when the 400 had another cause — never a guess.
    if (expired.kind === 'rejected' && expired.status === 400) {
      return this.stripeClient.request({ method: 'GET', path, schema: stripeCheckoutSessionSchema });
    }

    return expired;
  }

  async refund({ bookingId, sessionId }: RefundInput): Promise<CheckoutResult<Refund>> {
    const session = await this.stripeClient.request({
      method: 'GET',
      path: `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`,
      schema: stripeCheckoutSessionSchema,
    });

    if (session.kind !== 'ok') {
      return session;
    }

    if (session.data.paymentIntentId === null) {
      // Not paid through this session: nothing to refund here; the operator looks (R16).
      return { kind: 'rejected', status: 400, code: 'payment_intent_missing' };
    }

    const refund = await this.stripeClient.request({
      method: 'POST',
      path: REFUNDS_PATH,
      idempotencyKey: `refund-${bookingId}`,
      schema: stripeRefundSchema,
      // No amount: a full refund.
      params: { payment_intent: session.data.paymentIntentId, metadata: { booking_id: bookingId } },
    });

    if (refund.kind === 'rejected' && refund.code === 'charge_already_refunded') {
      return { kind: 'ok', data: { id: null, status: 'succeeded' } };
    }

    return refund;
  }

  chargeOf(sessionId: string): Promise<CheckoutResult<SessionCharge | null>> {
    return this.stripeClient.request({
      method: 'GET',
      path: `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`,
      schema: sessionChargeSchema,
      params: { expand: ['payment_intent.latest_charge'] },
    });
  }

  getRefund(refundId: string): Promise<CheckoutResult<Refund>> {
    return this.stripeClient.request({ method: 'GET', path: `${REFUNDS_PATH}/${encodeURIComponent(refundId)}`, schema: stripeRefundSchema });
  }
}
