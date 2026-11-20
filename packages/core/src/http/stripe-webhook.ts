import type { ApiHandlerOptions, HandlerArgs } from './apiHandler';
import { ValidationError } from './errors';

/** Stripe calls this endpoint: no CSRF header (third party), never cached. */
export const STRIPE_WEBHOOK_RESPONSE: ApiHandlerOptions = { csrf: false, headers: { 'Cache-Control': 'no-store' } };

/** Largest body read from this unauthenticated endpoint; Checkout events are a few kilobytes. */
export const STRIPE_WEBHOOK_MAX_BYTES = 512 * 1024;

export const WEBHOOK_SIGNATURE_MISSING_MESSAGE = 'Missing Stripe signature.';
export const WEBHOOK_TOO_LARGE_MESSAGE = 'Stripe event too large.';

/** The body as text, refusing (400) past `maxBytes` without buffering the rest. */
async function readBounded(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length'));

  if (declared > maxBytes) {
    throw new ValidationError(WEBHOOK_TOO_LARGE_MESSAGE);
  }

  const chunks: Uint8Array[] = [];
  let size = 0;

  if (req.body) {
    const reader = req.body.getReader();

    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;

      if (size > maxBytes) {
        await reader.cancel();
        throw new ValidationError(WEBHOOK_TOO_LARGE_MESSAGE);
      }

      chunks.push(read.value);
    }
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * `POST /api/webhooks/stripe`: hands the exact request bytes and the `Stripe-Signature` header to
 * the inbox before anything parses the body (the signature covers those bytes). Without a signature
 * the body is never read. 200 once the event is stored and processed (or was already); 400 for a
 * missing or bad signature, a bad or oversized body (nothing stored); 503 when the webhook secret is
 * missing; 500 when a handler failed (stored, Stripe redelivers).
 */
export async function receiveStripeWebhook({ req, cradle }: HandlerArgs<Record<string, never>>): Promise<{ received: true }> {
  const signature = req.headers.get('stripe-signature');

  if (signature === null || signature.trim() === '') {
    throw new ValidationError(WEBHOOK_SIGNATURE_MISSING_MESSAGE);
  }

  await cradle.stripeInboxService.receive(await readBounded(req, STRIPE_WEBHOOK_MAX_BYTES), signature);

  return { received: true };
}
