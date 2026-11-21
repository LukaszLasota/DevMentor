import { z } from 'zod';
import type { CheckoutResult } from './checkout-gateway';
import { type ConnectAccountSnapshot, type ConnectGateway, type StripeTransfer, type TransferInput, transferGroupOf } from './connect-gateway';
import type { StripeClient } from './stripe-client';

/** The fields of a Stripe Account this platform reads. */
export const stripeAccountSchema = z
  .object({
    id: z.string().min(1),
    payouts_enabled: z.boolean().nullable().optional(),
    details_submitted: z.boolean().nullable().optional(),
    capabilities: z.object({ transfers: z.enum(['active', 'inactive', 'pending']).optional() }).nullable().optional(),
    requirements: z
      .object({
        currently_due: z.array(z.string()).nullable().optional(),
        past_due: z.array(z.string()).nullable().optional(),
        disabled_reason: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .transform(
    (account): ConnectAccountSnapshot => ({
      id: account.id,
      payoutsEnabled: account.payouts_enabled === true,
      detailsSubmitted: account.details_submitted === true,
      transfers: account.capabilities?.transfers ?? null,
      currentlyDue: account.requirements?.currently_due ?? [],
      pastDue: account.requirements?.past_due ?? [],
      disabledReason: account.requirements?.disabled_reason ?? null,
    }),
  );

const accountLinkSchema = z.object({ url: z.string().min(1) }).transform(({ url }) => ({ url }));
const transferSchema = z.object({ id: z.string().min(1) }).transform(({ id }): StripeTransfer => ({ id }));
const transferListSchema = z
  .object({ data: z.array(z.object({ id: z.string().min(1) })) })
  .transform(({ data }): StripeTransfer | null => (data[0] === undefined ? null : { id: data[0].id }));

/**
 * Stripe Connect over the shared client (spec 2026-11-21-mentor-payouts): Express accounts in PL with
 * the `transfers` capability; separate charges and transfers, each transfer bound to its session's charge.
 */
export class StripeConnectGateway implements ConnectGateway {
  private readonly stripeClient: StripeClient;

  constructor({ stripeClient }: { stripeClient: StripeClient }) {
    this.stripeClient = stripeClient;
  }

  get configured(): boolean {
    return this.stripeClient.configured;
  }

  createAccount(mentorProfileId: string): Promise<CheckoutResult<ConnectAccountSnapshot>> {
    return this.stripeClient.request({
      method: 'POST',
      path: '/v1/accounts',
      idempotencyKey: `connect-account-${mentorProfileId}`,
      schema: stripeAccountSchema,
      params: {
        type: 'express',
        country: 'PL',
        capabilities: { transfers: { requested: true } },
        metadata: { mentor_profile_id: mentorProfileId },
      },
    });
  }

  createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<CheckoutResult<{ url: string }>> {
    return this.stripeClient.request({
      method: 'POST',
      path: '/v1/account_links',
      schema: accountLinkSchema,
      params: { account: accountId, type: 'account_onboarding', return_url: returnUrl, refresh_url: refreshUrl },
    });
  }

  retrieveAccount(accountId: string): Promise<CheckoutResult<ConnectAccountSnapshot>> {
    return this.stripeClient.request({ method: 'GET', path: `/v1/accounts/${encodeURIComponent(accountId)}`, schema: stripeAccountSchema });
  }

  findTransfer(bookingId: string): Promise<CheckoutResult<StripeTransfer | null>> {
    return this.stripeClient.request({
      method: 'GET',
      path: '/v1/transfers',
      schema: transferListSchema,
      params: { transfer_group: transferGroupOf(bookingId), limit: 1 },
    });
  }

  createTransfer(input: TransferInput): Promise<CheckoutResult<StripeTransfer>> {
    return this.stripeClient.request({
      method: 'POST',
      path: '/v1/transfers',
      idempotencyKey: `payout-${input.bookingId}-${input.attempt}`,
      schema: transferSchema,
      params: {
        amount: input.amountCents,
        currency: input.currency.toLowerCase(),
        destination: input.destination,
        source_transaction: input.sourceTransaction,
        transfer_group: transferGroupOf(input.bookingId),
        metadata: { booking_id: input.bookingId },
      },
    });
  }
}
