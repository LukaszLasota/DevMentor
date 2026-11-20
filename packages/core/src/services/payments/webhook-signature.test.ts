import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signStripePayload, STRIPE_SIGNATURE_TOLERANCE_SECONDS, verifyStripeSignature } from './webhook-signature';

const SECRET = 'whsec_test_secret';
const BODY = '{"id":"evt_1","type":"checkout.session.completed","data":{"object":{"id":"cs_1"}}}';
const T = 1_800_000_000;
const NOW = new Date(T * 1000);

const v1 = (body: string, secret: string, t: number) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

describe('signStripePayload', () => {
  it('builds the header Stripe sends', () => {
    expect(signStripePayload(BODY, SECRET, T)).toBe(`t=${T},v1=${v1(BODY, SECRET, T)}`);
  });
});

describe('verifyStripeSignature', () => {
  it('accepts a valid signature and returns its timestamp', () => {
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET, T), SECRET, NOW)).toEqual({ ok: true, timestamp: T });
  });

  it('accepts when any of several v1 signatures matches (secret rotation), ignoring v0 and noise', () => {
    const header = `t=${T}, v0=${'0'.repeat(64)}, v1=${'a'.repeat(64)}, v1=${v1(BODY, SECRET, T).toUpperCase()}, junk, =x`;

    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toEqual({ ok: true, timestamp: T });
  });

  it('refuses a missing header', () => {
    expect(verifyStripeSignature(BODY, null, SECRET, NOW)).toEqual({ ok: false, reason: 'missing' });
    expect(verifyStripeSignature(BODY, '  ', SECRET, NOW)).toEqual({ ok: false, reason: 'missing' });
  });

  it.each([
    ['no timestamp', `v1=${'a'.repeat(64)}`],
    ['no v1', `t=${T},v0=${'a'.repeat(64)}`],
    ['a non-numeric timestamp', `t=abc,v1=${'a'.repeat(64)}`],
    ['a short v1', `t=${T},v1=abc`],
  ])('refuses a header with %s as malformed', (_name, header) => {
    expect(verifyStripeSignature(BODY, header, SECRET, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('refuses a signature outside the tolerance, either way', () => {
    const old = T - STRIPE_SIGNATURE_TOLERANCE_SECONDS - 1;
    const future = T + STRIPE_SIGNATURE_TOLERANCE_SECONDS + 1;

    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET, old), SECRET, NOW)).toEqual({ ok: false, reason: 'stale' });
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET, future), SECRET, NOW)).toEqual({
      ok: false,
      reason: 'stale',
    });
    const edge = T - STRIPE_SIGNATURE_TOLERANCE_SECONDS;
    expect(verifyStripeSignature(BODY, signStripePayload(BODY, SECRET, edge), SECRET, NOW)).toMatchObject({ ok: true });
  });

  it('refuses a wrong secret or a tampered body', () => {
    const header = signStripePayload(BODY, SECRET, T);

    expect(verifyStripeSignature(BODY, header, 'whsec_other', NOW)).toEqual({ ok: false, reason: 'mismatch' });
    expect(verifyStripeSignature(BODY.replace('cs_1', 'cs_2'), header, SECRET, NOW)).toEqual({ ok: false, reason: 'mismatch' });
  });
});
