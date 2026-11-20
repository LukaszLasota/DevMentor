import { createHmac, timingSafeEqual } from 'node:crypto';

/** Stripe's default tolerance: a signature older (or newer) than this is refused as a replay. */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureCheck =
  | { ok: true; timestamp: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

/** `t=<unix>,v1=<hex>`: HMAC-SHA256 of `${t}.${body}` with the endpoint secret. */
export function signStripePayload(rawBody: string, secret: string, timestamp: number): string {
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

/**
 * Verifies a `Stripe-Signature` header over the exact request bytes (no SDK): every `v1` entry is
 * compared in constant time, other schemes (`v0`) are ignored, and the timestamp must be within
 * the tolerance of `now` — in either direction, stricter than Stripe's SDK (age only): a timestamp
 * from the future is as suspicious as an old one, and Stripe redelivers on our 400. Pure: the
 * caller supplies the clock.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: Date,
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): SignatureCheck {
  if (header === null || header.trim() === '') {
    return { ok: false, reason: 'missing' };
  }

  let timestamp: number | undefined;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (key === 't' && /^\d+$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }

  if (timestamp === undefined || signatures.length === 0) {
    return { ok: false, reason: 'malformed' };
  }

  if (Math.abs(Math.floor(now.getTime() / 1000) - timestamp) > toleranceSeconds) {
    return { ok: false, reason: 'stale' };
  }

  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex'),
    'utf8',
  );
  const matches = signatures.some((signature) => timingSafeEqual(Buffer.from(signature, 'utf8'), expected));

  return matches ? { ok: true, timestamp } : { ok: false, reason: 'mismatch' };
}
