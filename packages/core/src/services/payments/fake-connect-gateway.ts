import type { CheckoutResult } from './checkout-gateway';
import type { ConnectAccountSnapshot, ConnectGateway, StripeTransfer, TransferInput } from './connect-gateway';

type Failure = Exclude<CheckoutResult<unknown>, { kind: 'ok' }>;

/**
 * In-memory Connect for unit tests: accounts per mentor (idempotent), scriptable account state, and
 * transfers per booking with Stripe-like idempotency (same key → same transfer). `dropNextTransferResponse`
 * makes the next create happen but answer `retryable`, like a lost response.
 */
export class FakeConnectGateway implements ConnectGateway {
  configured = true;
  readonly accounts = new Map<string, ConnectAccountSnapshot>();
  readonly transfers: (StripeTransfer & TransferInput)[] = [];
  readonly links: { accountId: string; returnUrl: string; refreshUrl: string }[] = [];
  /** The next call (any method) answers this instead (then it is cleared). */
  nextFailure: Failure | undefined;
  dropNextTransferResponse = false;
  /** State a newly created account starts with. */
  newAccount: Partial<ConnectAccountSnapshot> = {};

  private take(): Failure | undefined {
    const failure = this.nextFailure;
    this.nextFailure = undefined;

    return failure;
  }

  /** Lets a test move an account's state, as Stripe would after onboarding. */
  update(accountId: string, fields: Partial<ConnectAccountSnapshot>): void {
    this.accounts.set(accountId, { ...(this.accounts.get(accountId) as ConnectAccountSnapshot), ...fields });
  }

  async createAccount(mentorProfileId: string): Promise<CheckoutResult<ConnectAccountSnapshot>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const id = `acct_fake_${mentorProfileId}`;
    const account = this.accounts.get(id) ?? {
      id,
      payoutsEnabled: false,
      detailsSubmitted: false,
      transfers: 'pending' as const,
      currentlyDue: ['external_account'],
      pastDue: [],
      disabledReason: null,
      ...this.newAccount,
    };
    this.accounts.set(id, account);

    return { kind: 'ok', data: { ...account } };
  }

  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<CheckoutResult<{ url: string }>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    this.links.push({ accountId, returnUrl, refreshUrl });

    return { kind: 'ok', data: { url: `https://connect.fake.test/onboard/${accountId}/${this.links.length}` } };
  }

  async retrieveAccount(accountId: string): Promise<CheckoutResult<ConnectAccountSnapshot>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const account = this.accounts.get(accountId);

    return account ? { kind: 'ok', data: { ...account } } : { kind: 'rejected', status: 404, code: 'resource_missing' };
  }

  async findTransfer(bookingId: string): Promise<CheckoutResult<StripeTransfer | null>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const transfer = this.transfers.find((candidate) => candidate.bookingId === bookingId);

    return { kind: 'ok', data: transfer ? { id: transfer.id } : null };
  }

  async createTransfer(input: TransferInput): Promise<CheckoutResult<StripeTransfer>> {
    const failure = this.take();

    if (failure) {
      return failure;
    }

    const existing = this.transfers.find((candidate) => candidate.bookingId === input.bookingId && candidate.attempt === input.attempt);
    const transfer = existing ?? { id: `tr_fake_${input.bookingId}_${input.attempt}`, ...input };

    if (!existing) {
      this.transfers.push(transfer);
    }

    if (this.dropNextTransferResponse) {
      this.dropNextTransferResponse = false;

      return { kind: 'retryable' };
    }

    return { kind: 'ok', data: { id: transfer.id } };
  }
}
