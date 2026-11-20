import type { StripeOutcome } from './stripe-client';

/** What a booking asks Checkout for (spec 2026-11-20-booking-stripe-checkout, API Contracts). */
export interface CheckoutSessionInput {
  /** Our booking id: `client_reference_id`, `metadata.booking_id` and the idempotency key. */
  bookingId: string;
  amountCents: number;
  /** ISO 4217, e.g. `PLN`. */
  currency: string;
  productName: string;
  customerEmail?: string;
  /** When Stripe closes the session (at least 30 minutes ahead). */
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
}

export type CheckoutSessionStatus = 'open' | 'complete' | 'expired';

/** The normalized session; never the raw Stripe payload. */
export interface CheckoutSession {
  id: string;
  /** The hosted payment page; `null` once the session is no longer open. */
  url: string | null;
  status: CheckoutSessionStatus;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required';
  expiresAt: Date;
  clientReferenceId: string | null;
  amountTotal: number | null;
  /** Upper-case ISO 4217, or `null`. */
  currency: string | null;
  /** The PaymentIntent a completed session paid through (what a refund names), or `null`. */
  paymentIntentId: string | null;
}

/** Our refund states (spec 2026-11-20-booking-cancellation): Stripe's five folded into three. */
export type RefundState = 'pending' | 'succeeded' | 'failed';

/** A Stripe refund as booking code sees it; `id` is `null` when Stripe said the charge was already refunded. */
export interface Refund {
  id: string | null;
  status: RefundState;
}

/** A full refund of one booking's Checkout payment. */
export interface RefundInput {
  /** Our booking id: `metadata.booking_id` and the idempotency key (`refund-<bookingId>`). */
  bookingId: string;
  sessionId: string;
}

/** The Stripe client's outcome classes, so callers decide once per class (503, operator, retry). */
export type CheckoutResult<T> = StripeOutcome<T>;

/** The port booking code depends on; Stripe adapter in production, fake in unit tests. */
export interface CheckoutGateway {
  /** False when payments are not configured (no secret key): callers answer 503 before holding anything. */
  readonly configured: boolean;
  createSession(input: CheckoutSessionInput): Promise<CheckoutResult<CheckoutSession>>;
  /**
   * Closes an open session so it can no longer be paid. A session that is already `complete` or
   * `expired` is returned as it is, so the caller can confirm a payment that beat the expiry.
   */
  expireSession(sessionId: string): Promise<CheckoutResult<CheckoutSession>>;
  /**
   * Refunds the session's payment in full, idempotent by booking id. A charge Stripe reports as already
   * refunded answers `succeeded` (a retry after the idempotency key expired is never a second refund).
   */
  refund(input: RefundInput): Promise<CheckoutResult<Refund>>;
  /** Reads a refund's current state (a `pending` one may have settled since). */
  getRefund(refundId: string): Promise<CheckoutResult<Refund>>;
}
