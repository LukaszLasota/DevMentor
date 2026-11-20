import type { ApiHandlerOptions, HandlerArgs } from './apiHandler';

/** Stripe calls this endpoint: no CSRF header (third party), never cached. */
export const STRIPE_WEBHOOK_RESPONSE: ApiHandlerOptions = { csrf: false, headers: { 'Cache-Control': 'no-store' } };

/**
 * `POST /api/webhooks/stripe`: hands the exact request bytes and the `Stripe-Signature` header to
 * the inbox before anything parses the body (the signature covers those bytes). 200 once the event
 * is stored and processed (or was already); 400 for a bad signature or body (nothing stored); 503
 * when the webhook secret is missing; 500 when a handler failed (stored, Stripe redelivers).
 */
export async function receiveStripeWebhook({ req, cradle }: HandlerArgs<Record<string, never>>): Promise<{ received: true }> {
  await cradle.stripeInboxService.receive(await req.text(), req.headers.get('stripe-signature'));

  return { received: true };
}
