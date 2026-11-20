import type { EntityManager } from '@devmentor/db';
import { z } from 'zod';
import type { Cradle } from '../../container/cradle';
import { stripeCheckoutSessionSchema } from './stripe-checkout-gateway';

/** The envelope fields of a Stripe event the inbox relies on; the rest of the payload is kept as is. */
export const stripeWebhookEventSchema = z.looseObject({
  id: z.string().regex(/^evt_\w+$/, 'must be a Stripe event id'),
  type: z.string().min(1),
  created: z.number().int(),
  data: z.looseObject({ object: z.record(z.string(), z.unknown()) }),
});

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>;

/** Work to run once the inbox transaction has committed (mail, events); failures are only logged. */
export type AfterCommit = () => Promise<void>;

/**
 * Applies one event inside the inbox's transaction (`em` is that transaction's manager). Must be
 * idempotent and never go backwards: Stripe redelivers, and events arrive out of order. Throwing
 * rolls its writes back and leaves the event to be retried. May return an `AfterCommit`.
 */
export type StripeEventHandler = (event: StripeWebhookEvent, em: EntityManager) => Promise<AfterCommit | void>;

/** Event type → handler. Types without a handler are stored and marked processed (ignored). */
export type StripeEventHandlers = ReadonlyMap<string, StripeEventHandler>;

/**
 * The registry, built per request scope so handlers can use scoped services (spec
 * 2026-11-20-booking-stripe-checkout): Checkout completion confirms or orphans a booking, expiry
 * releases a hold. #26 adds `account.updated`. A Checkout object that does not parse can never be
 * applied, so it is logged and acknowledged rather than redelivered forever.
 */
export function createStripeEventHandlers({ bookingService, logger }: Pick<Cradle, 'bookingService' | 'logger'>): StripeEventHandlers {
  const checkoutSession = (event: StripeWebhookEvent) => {
    const parsed = stripeCheckoutSessionSchema.safeParse(event.data.object);

    if (!parsed.success) {
      logger.error({ stripeEvent: { id: event.id, type: event.type } }, 'Stripe event carries no readable Checkout Session; ignored');
    }

    return parsed.success ? parsed.data : null;
  };

  return new Map<string, StripeEventHandler>([
    [
      'checkout.session.completed',
      async (event, em) => {
        const session = checkoutSession(event);

        if (session === null) {
          return;
        }

        const { outcome, booking } = await bookingService.applyCompleted(em, session);

        if (outcome === 'confirmed' && booking !== null) {
          return () => bookingService.announceConfirmed(booking.id);
        }
      },
    ],
    [
      'checkout.session.expired',
      async (event, em) => {
        const session = checkoutSession(event);

        if (session !== null) {
          await bookingService.applyExpired(em, session);
        }
      },
    ],
  ]);
}
