import type { EntityManager } from '@devmentor/db';
import { z } from 'zod';

/** The envelope fields of a Stripe event the inbox relies on; the rest of the payload is kept as is. */
export const stripeWebhookEventSchema = z.looseObject({
  id: z.string().regex(/^evt_\w+$/, 'must be a Stripe event id'),
  type: z.string().min(1),
  created: z.number().int(),
  data: z.looseObject({ object: z.record(z.string(), z.unknown()) }),
});

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>;

/**
 * Applies one event inside the inbox's transaction (`em` is that transaction's manager). Must be
 * idempotent and never go backwards: Stripe redelivers, and events arrive out of order. Throwing
 * rolls its writes back and leaves the event to be retried.
 */
export type StripeEventHandler = (event: StripeWebhookEvent, em: EntityManager) => Promise<void>;

/** Event type → handler. Types without a handler are stored and marked processed (ignored). */
export type StripeEventHandlers = ReadonlyMap<string, StripeEventHandler>;

/**
 * The registry, built per request scope so handlers can use scoped services. Phase 2 of the booking
 * spec adds `checkout.session.completed` / `checkout.session.expired`; #26 adds `account.updated`.
 */
export function createStripeEventHandlers(): StripeEventHandlers {
  return new Map();
}
