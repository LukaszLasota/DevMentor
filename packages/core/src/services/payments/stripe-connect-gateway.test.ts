import { describe, expect, it, vi } from 'vitest';
import type { StripeClient, StripeOutcome, StripeRequest } from './stripe-client';
import { stripeAccountSchema, StripeConnectGateway } from './stripe-connect-gateway';

function setup(...outcomes: StripeOutcome<unknown>[]) {
  const request = vi.fn(async (req: StripeRequest<unknown>) => {
    const next = outcomes.shift() ?? { kind: 'retryable' };

    return next.kind === 'ok' ? { kind: 'ok' as const, data: req.schema.parse(next.data) } : next;
  });

  return { gateway: new StripeConnectGateway({ stripeClient: { configured: true, request } as unknown as StripeClient }), request };
}

const RAW_ACCOUNT = {
  id: 'acct_1',
  object: 'account',
  payouts_enabled: true,
  details_submitted: true,
  capabilities: { transfers: 'active', card_payments: 'inactive' },
  requirements: { currently_due: [], past_due: [], disabled_reason: null, eventually_due: ['x'] },
  email: 'not-kept@example.test',
};

describe('stripeAccountSchema', () => {
  it('keeps only what the status needs', () => {
    expect(stripeAccountSchema.parse(RAW_ACCOUNT)).toEqual({
      id: 'acct_1',
      payoutsEnabled: true,
      detailsSubmitted: true,
      transfers: 'active',
      currentlyDue: [],
      pastDue: [],
      disabledReason: null,
    });
  });

  it('reads a fresh account with nothing filled in', () => {
    expect(stripeAccountSchema.parse({ id: 'acct_2', capabilities: null, requirements: null, payouts_enabled: null })).toEqual({
      id: 'acct_2',
      payoutsEnabled: false,
      detailsSubmitted: false,
      transfers: null,
      currentlyDue: [],
      pastDue: [],
      disabledReason: null,
    });
    expect(stripeAccountSchema.parse({ id: 'acct_3', capabilities: {}, requirements: {} }).transfers).toBeNull();
  });
});

describe('StripeConnectGateway', () => {
  it('creates an Express PL account with transfers, idempotent per mentor', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: RAW_ACCOUNT });

    await expect(gateway.createAccount('m-1')).resolves.toMatchObject({ kind: 'ok', data: { id: 'acct_1' } });
    expect(gateway.configured).toBe(true);
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/v1/accounts',
      idempotencyKey: 'connect-account-m-1',
      params: { type: 'express', country: 'PL', capabilities: { transfers: { requested: true } }, metadata: { mentor_profile_id: 'm-1' } },
    });
  });

  it('mints an onboarding link and reads an account', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: { url: 'https://connect.stripe.com/x', object: 'account_link' } }, { kind: 'ok', data: RAW_ACCOUNT });

    await expect(gateway.createAccountLink('acct_1', 'https://app/r', 'https://app/f')).resolves.toEqual({ kind: 'ok', data: { url: 'https://connect.stripe.com/x' } });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      path: '/v1/account_links',
      params: { account: 'acct_1', type: 'account_onboarding', return_url: 'https://app/r', refresh_url: 'https://app/f' },
    });
    await gateway.retrieveAccount('acct_1');
    expect(request.mock.calls[1]?.[0]).toMatchObject({ method: 'GET', path: '/v1/accounts/acct_1' });
  });

  it('finds the transfer of a booking by its group', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: { data: [{ id: 'tr_1', amount: 1 }] } }, { kind: 'ok', data: { data: [] } });

    await expect(gateway.findTransfer('b-1')).resolves.toEqual({ kind: 'ok', data: { id: 'tr_1' } });
    expect(request.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', path: '/v1/transfers', params: { transfer_group: 'booking_b-1', limit: 1 } });
    await expect(gateway.findTransfer('b-2')).resolves.toEqual({ kind: 'ok', data: null });
  });

  it('creates a transfer bound to the session charge, with an attempt-scoped key', async () => {
    const { gateway, request } = setup({ kind: 'ok', data: { id: 'tr_1', object: 'transfer' } });

    await expect(
      gateway.createTransfer({ bookingId: 'b-1', attempt: 2, amountCents: 12000, currency: 'PLN', destination: 'acct_1', sourceTransaction: 'ch_1' }),
    ).resolves.toEqual({ kind: 'ok', data: { id: 'tr_1' } });
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/v1/transfers',
      idempotencyKey: 'payout-b-1-2',
      params: { amount: 12000, currency: 'pln', destination: 'acct_1', source_transaction: 'ch_1', transfer_group: 'booking_b-1', metadata: { booking_id: 'b-1' } },
    });
  });
});
