import type { CheckoutResult } from './checkout-gateway';

/** What DevMentor reads from a Stripe connected account (spec 2026-11-21-mentor-payouts); no KYC or bank data. */
export interface ConnectAccountSnapshot {
  id: string;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** The `transfers` capability, or `null` when Stripe has not listed it. */
  transfers: 'active' | 'inactive' | 'pending' | null;
  currentlyDue: string[];
  pastDue: string[];
  disabledReason: string | null;
}

/** A Stripe transfer as payouts see it. */
export interface StripeTransfer {
  id: string;
}

export interface TransferInput {
  bookingId: string;
  /** Part of the idempotency key: a new attempt after a definite refusal gets a new key. */
  attempt: number;
  amountCents: number;
  currency: string;
  destination: string;
  /** The session's charge: the transfer uses exactly its funds. */
  sourceTransaction: string;
}

/** The Connect port; Stripe adapter in production, fake in unit tests. */
export interface ConnectGateway {
  readonly configured: boolean;
  /** Creates the mentor's Express account, idempotent per mentor (`connect-account-<mentorProfileId>`). */
  createAccount(mentorProfileId: string): Promise<CheckoutResult<ConnectAccountSnapshot>>;
  /** A fresh, single-use hosted onboarding link; never stored. */
  createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<CheckoutResult<{ url: string }>>;
  retrieveAccount(accountId: string): Promise<CheckoutResult<ConnectAccountSnapshot>>;
  /** The transfer already made for a booking (`transfer_group = booking_<id>`), or `null`. */
  findTransfer(bookingId: string): Promise<CheckoutResult<StripeTransfer | null>>;
  createTransfer(input: TransferInput): Promise<CheckoutResult<StripeTransfer>>;
}

/** The transfer group that ties every transfer to its booking (also the lookup key). */
export const transferGroupOf = (bookingId: string): string => `booking_${bookingId}`;
