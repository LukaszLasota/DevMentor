import { defineEntity, p } from '@mikro-orm/postgresql';

/** `attempts` never goes negative. */
export const STRIPE_EVENT_ATTEMPTS_CHECK = 'attempts >= 0';

/** `processed_at` is set only after at least one attempt. */
export const STRIPE_EVENT_PROCESSED_CHECK = 'processed_at is null or attempts > 0';

/**
 * The durable Stripe webhook inbox (spec 2026-11-20-booking-stripe-checkout): one row per verified
 * event, keyed by Stripe's event id, so a redelivery is a no-op. `processed_at` null = still to
 * (re)process. Holds the verified payload only (Checkout events carry no card data); `last_error`
 * is a redacted message, never the payload. No foreign keys: handlers find their rows by ids in it.
 */
export const StripeEventSchema = defineEntity({
  name: 'StripeEvent',
  tableName: 'stripe_events',
  checks: [
    { name: 'stripe_events_attempts_check', expression: STRIPE_EVENT_ATTEMPTS_CHECK },
    { name: 'stripe_events_processed_check', expression: STRIPE_EVENT_PROCESSED_CHECK },
  ],
  properties: {
    id: p.text().primary(),
    type: p.text(),
    payload: p.json<Record<string, unknown>>(),
    receivedAt: p.datetime(),
    processedAt: p.datetime().nullable(),
    attempts: p.integer().default(0),
    lastError: p.text().nullable(),
  },
});

export class StripeEvent extends StripeEventSchema.class {}

StripeEventSchema.setClass(StripeEvent);
