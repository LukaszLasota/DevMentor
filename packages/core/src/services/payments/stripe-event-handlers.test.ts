import { describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../../container/cradle';
import { createStripeEventHandlers, type StripeWebhookEvent } from './stripe-event-handlers';

const em = {} as Cradle['em'];
const RAW = {
  id: 'cs_1',
  object: 'checkout.session',
  status: 'complete',
  payment_status: 'paid',
  expires_at: 1_800_000_000,
  client_reference_id: 'b-1',
  amount_total: 15000,
  currency: 'pln',
};
const event = (type: string, object: Record<string, unknown> = RAW): StripeWebhookEvent => ({
  id: 'evt_1',
  type,
  created: 1,
  data: { object },
});

function setup(outcome: 'confirmed' | 'already_confirmed' | 'orphaned' | 'ignored' = 'confirmed') {
  const booking = outcome === 'ignored' ? null : { id: 'b-1' };
  const bookingService = {
    applyCompleted: vi.fn(async () => ({ outcome, booking })),
    applyExpired: vi.fn(async () => undefined),
    announceConfirmed: vi.fn(async () => undefined),
  };
  const logger = { error: vi.fn() };
  const handlers = createStripeEventHandlers({
    bookingService: bookingService as unknown as Cradle['bookingService'],
    logger: logger as unknown as Cradle['logger'],
  });

  return { handlers, bookingService, logger };
}

describe('createStripeEventHandlers', () => {
  it('registers Checkout completion and expiry', () => {
    expect([...setup().handlers.keys()]).toEqual(['checkout.session.completed', 'checkout.session.expired']);
  });

  it('applies a completed session in the inbox transaction and announces a confirmation after the commit', async () => {
    const { handlers, bookingService } = setup();

    const followUp = await handlers.get('checkout.session.completed')?.(event('checkout.session.completed'), em);

    expect(bookingService.applyCompleted).toHaveBeenCalledWith(em, expect.objectContaining({ id: 'cs_1', clientReferenceId: 'b-1', currency: 'PLN' }));
    expect(bookingService.announceConfirmed).not.toHaveBeenCalled();
    await (followUp as () => Promise<void>)();
    expect(bookingService.announceConfirmed).toHaveBeenCalledWith('b-1');
  });

  it.each(['already_confirmed', 'orphaned', 'ignored'] as const)('announces nothing when the outcome is %s', async (outcome) => {
    const { handlers } = setup(outcome);

    await expect(handlers.get('checkout.session.completed')?.(event('checkout.session.completed'), em)).resolves.toBeUndefined();
  });

  it('applies an expired session', async () => {
    const { handlers, bookingService } = setup();

    await handlers.get('checkout.session.expired')?.(event('checkout.session.expired', { ...RAW, status: 'expired', payment_status: 'unpaid' }), em);

    expect(bookingService.applyExpired).toHaveBeenCalledWith(em, expect.objectContaining({ id: 'cs_1', status: 'expired' }));
  });

  it.each(['checkout.session.completed', 'checkout.session.expired'])('logs and acknowledges a %s without a readable session', async (type) => {
    const { handlers, bookingService, logger } = setup();

    await expect(handlers.get(type)?.(event(type, { id: 'cs_1' }), em)).resolves.toBeUndefined();

    expect(bookingService.applyCompleted).not.toHaveBeenCalled();
    expect(bookingService.applyExpired).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith({ stripeEvent: { id: 'evt_1', type } }, expect.stringContaining('ignored'));
  });
});
