// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // The behaviour is tested in core (`stripe-webhook.test.ts`, through the real apiHandler) and over
  // HTTP in `integration/stripe-webhook.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  receiveStripeWebhook: 'receiveStripeWebhook',
  STRIPE_WEBHOOK_RESPONSE: 'STRIPE_WEBHOOK_RESPONSE',
}));

describe('POST /api/webhooks/stripe', () => {
  it('wires the webhook handler and its options into apiHandler', async () => {
    const { POST } = await import('./route');

    expect(POST).toEqual({ handler: 'receiveStripeWebhook', options: 'STRIPE_WEBHOOK_RESPONSE' });
  });
});
