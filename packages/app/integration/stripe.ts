import { inject } from 'vitest';
import { STRIPE_TEST_SECRET_KEY } from './stripe-credentials';

export { STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET } from './stripe-credentials';

export interface StubEvent {
  id: string;
  type: string;
  /** HTTP status of each delivery to the app (0 = unreachable). */
  deliveries: number[];
  sessionId: string;
}

export interface StubSession {
  id: string;
  url: string;
  status: string;
}

/** Creates a Checkout Session on the stub the way the app's Stripe client does (form body, bearer key). */
export async function createStubSession(bookingId: string): Promise<StubSession> {
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'pln',
    'line_items[0][price_data][unit_amount]': '15000',
    'line_items[0][price_data][product_data][name]': '25-minute text session',
    client_reference_id: bookingId,
    'metadata[booking_id]': bookingId,
    expires_at: String(Math.floor(Date.now() / 1000) + 31 * 60),
    success_url: `${inject('baseUrl')}/bookings/${bookingId}`,
    cancel_url: `${inject('baseUrl')}/mentors`,
  });
  const response = await fetch(`${inject('stripeStubUrl')}/v1/checkout/sessions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${STRIPE_TEST_SECRET_KEY}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Stripe stub refused the session: ${response.status}`);
  }

  return (await response.json()) as StubSession;
}

/** Every event the stub sent, with its delivery statuses. */
export async function stubEvents(): Promise<StubEvent[]> {
  return (await (await fetch(`${inject('stripeStubUrl')}/__stub/events`)).json()) as StubEvent[];
}

/** Redelivers an event, as Stripe does after a failure or at random. */
export async function resendStubEvent(eventId: string): Promise<number[]> {
  const response = await fetch(`${inject('stripeStubUrl')}/__stub/events/${eventId}/resend`, { method: 'POST' });

  return ((await response.json()) as { deliveries: number[] }).deliveries;
}
