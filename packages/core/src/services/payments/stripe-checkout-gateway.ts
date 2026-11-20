import { z } from 'zod';
import type { CheckoutGateway, CheckoutResult, CheckoutSession, CheckoutSessionInput } from './checkout-gateway';
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
    }),
  );

const SESSIONS_PATH = '/v1/checkout/sessions';

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
}
