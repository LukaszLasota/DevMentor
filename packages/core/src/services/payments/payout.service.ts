import { Booking, BookingReport, ConnectAccount, type HoldReason, isUniqueViolation, Payout, PAYOUT_BOOKING_UNIQUE, type PayoutStatus } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { lockForUpdate } from '../bookings/booking.service';
import { mentorNameForOperator } from '../mentors/mentor-name';

/** A session is due this long after its end: the written-answer window (#31) has closed. */
export const PAYOUT_DELAY_MS = 24 * 60 * 60_000;
/** A `transferring` payout younger than this belongs to a run still in progress. */
export const CLAIM_TIMEOUT_MS = 10 * 60_000;
/** Bookings settled per release (a bounded request); the rest is reported. */
export const RELEASE_BATCH = 25;
/** How many due candidates one release looks at before filtering out paid ones. */
const CANDIDATE_LIMIT = 500;

export type SettleOutcome = 'transferred' | 'held' | 'failed' | 'inFlight';

export interface ReleaseResult {
  transferred: number;
  held: number;
  failed: number;
  inFlight: number;
  remaining: number;
}

/** A payout the operator should look at (`/admin`). */
export interface PayoutItem {
  bookingId: string;
  status: PayoutStatus;
  holdReason: HoldReason | null;
  failureCode: string | null;
  netCents: number;
  feeCents: number;
  currency: string;
  startsAt: string;
  mentorName: string;
  updatedAt: string;
}

/** `fee = round(gross × bps / 10000)` half up, `net = gross − fee`: integer cents, `fee + net = gross`. */
export function splitFee(grossCents: number, feeBps: number): { feeCents: number; netCents: number } {
  const feeCents = Math.round((grossCents * feeBps) / 10_000);

  return { feeCents, netCents: grossCents - feeCents };
}

/**
 * Mentor payouts (spec 2026-11-21-mentor-payouts, #35): the operator releases due sessions; each gets
 * one payout row with frozen amounts. Checks (dispute, Connect status re-read now, the charge not
 * reversed) run first; then the payout is claimed as `transferring` under the booking row lock;
 * the transfer is looked up by its group before one is created, and the result is written only over
 * `transferring`. A crash or a lost answer leaves `transferring`, which a later run resolves through
 * the lookup — so a transfer is never made twice, even after Stripe forgets the idempotency key.
 */
export class PayoutService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly logger: Cradle['logger'];
  private readonly checkoutGateway: Cradle['checkoutGateway'];
  private readonly connectGateway: Cradle['connectGateway'];
  private readonly connectService: Cradle['connectService'];

  constructor({
    em,
    clock,
    logger,
    checkoutGateway,
    connectGateway,
    connectService,
  }: Pick<Cradle, 'em' | 'clock' | 'logger' | 'checkoutGateway' | 'connectGateway' | 'connectService'>) {
    this.em = em;
    this.clock = clock;
    this.logger = logger;
    this.checkoutGateway = checkoutGateway;
    this.connectGateway = connectGateway;
    this.connectService = connectService;
  }

  /** Settles up to `RELEASE_BATCH` due bookings, oldest first. */
  async releaseDue(): Promise<ReleaseResult> {
    const cutoff = new Date(this.clock.now().getTime() - PAYOUT_DELAY_MS);
    const candidates = await this.em.find(Booking, { status: 'confirmed', endsAt: { $lte: cutoff } }, { orderBy: { endsAt: 'asc' }, limit: CANDIDATE_LIMIT });
    const paid = new Set(
      (await this.em.find(Payout, { booking: { $in: candidates.map((booking) => booking.id) }, status: 'transferred' })).map((payout) => payout.booking.id),
    );
    const due = candidates.filter((booking) => !paid.has(booking.id));
    const result: ReleaseResult = { transferred: 0, held: 0, failed: 0, inFlight: 0, remaining: Math.max(0, due.length - RELEASE_BATCH) };

    for (const booking of due.slice(0, RELEASE_BATCH)) {
      result[await this.settle(booking)] += 1;
      this.em.clear();
    }

    return result;
  }

  /** Payouts not yet transferred, for the operator. */
  async list(): Promise<PayoutItem[]> {
    const payouts = await this.em.find(Payout, { status: { $ne: 'transferred' } }, { populate: ['booking', 'mentorProfile.user'], orderBy: { updatedAt: 'desc' } });

    return payouts.map((payout) => ({
      bookingId: payout.booking.id,
      status: payout.status,
      holdReason: payout.holdReason ?? null,
      failureCode: payout.failureCode ?? null,
      netCents: payout.netCents,
      feeCents: payout.feeCents,
      currency: payout.currency,
      startsAt: payout.booking.getEntity().startsAt.toISOString(),
      mentorName: mentorNameForOperator(payout.mentorProfile.getEntity().displayName, payout.mentorProfile.getEntity().user.getEntity().email),
      updatedAt: payout.updatedAt.toISOString(),
    }));
  }

  private async settle(booking: Booking): Promise<SettleOutcome> {
    const payout = await this.payoutOf(booking);

    if (payout.status === 'transferring' && this.fresh(payout)) {
      return 'inFlight';
    }

    // 1. Checks, outside any transaction (they call Stripe).
    if ((await this.em.findOne(BookingReport, { booking: booking.id, resolvedAt: null })) !== null) {
      return this.hold(payout, 'disputed');
    }

    const account = await this.em.findOne(ConnectAccount, { mentorProfile: booking.mentorProfile.id });
    const status = account === null ? null : ((await this.connectService.reconcile(account)) ?? account.onboardingStatus);

    if (account === null || status !== 'enabled') {
      return this.hold(payout, 'connect_not_enabled');
    }

    const charge = await this.checkoutGateway.chargeOf(booking.checkoutSessionId as string);

    if (charge.kind !== 'ok') {
      this.logger.warn({ booking: { id: booking.id }, charge: { kind: charge.kind } }, 'Could not read the session charge; payout left for the next run');
      return 'inFlight';
    }

    if (charge.data === null) {
      await this.em.nativeUpdate(Payout, { id: payout.id, status: { $ne: 'transferred' } }, { status: 'failed', holdReason: null, failureCode: 'charge_missing' });
      return 'failed';
    }

    if (charge.data.refunded || charge.data.amountRefunded > 0 || charge.data.disputed) {
      return this.hold(payout, 'charge_reversed');
    }

    // 2. Claim under the booking row lock.
    const claimed = await this.em.transactional(async (em) => {
      await em.findOne(Booking, { id: booking.id }, lockForUpdate());
      const current = (await em.findOne(Payout, { id: payout.id }, lockForUpdate())) as Payout;

      if (current.status === 'transferred' || (current.status === 'transferring' && this.fresh(current))) {
        return null;
      }

      current.status = 'transferring';
      current.holdReason = null;
      current.chargeId = (charge.data as { id: string }).id;

      return { attempt: current.attempt };
    });

    if (claimed === null) {
      return 'inFlight';
    }

    // 3. Look up before creating: a transfer Stripe already made is adopted, never repeated.
    const found = await this.connectGateway.findTransfer(booking.id);

    if (found.kind !== 'ok') {
      return 'inFlight';
    }

    if (found.data !== null) {
      return this.transferred(payout.id, found.data.id);
    }

    const created = await this.connectGateway.createTransfer({
      bookingId: booking.id,
      attempt: claimed.attempt,
      amountCents: payout.netCents,
      currency: payout.currency,
      destination: account.providerAccountId,
      sourceTransaction: charge.data.id,
    });

    // 4. Write the result only over `transferring`.
    if (created.kind === 'ok') {
      return this.transferred(payout.id, created.data.id);
    }

    if (created.kind === 'rejected' || created.kind === 'idempotency_mismatch') {
      const code = created.kind === 'rejected' ? (created.code ?? `http_${created.status}`) : 'idempotency_mismatch';
      await this.em.nativeUpdate(Payout, { id: payout.id, status: 'transferring' }, { status: 'failed', failureCode: code, attempt: claimed.attempt + 1 });
      this.logger.error({ booking: { id: booking.id }, payout: { code } }, 'Stripe refused a payout transfer — operator follow-up (R16)');
      return 'failed';
    }

    // Unknown (timeout, 5xx, misconfigured): stays `transferring`; a later run looks it up.
    this.logger.warn({ booking: { id: booking.id }, payout: { kind: created.kind } }, 'Payout transfer not confirmed by Stripe; stays transferring');
    return 'inFlight';
  }

  /** The booking's payout, created on first sight with frozen amounts (a lost insert race reads the winner's). */
  private async payoutOf(booking: Booking): Promise<Payout> {
    const existing = await this.em.findOne(Payout, { booking: booking.id });

    if (existing !== null) {
      return existing;
    }

    const feeBps = booking.feeBps as number;
    const { feeCents, netCents } = splitFee(booking.priceCents, feeBps);

    try {
      return await this.em.transactional(async (em) =>
        em.create(Payout, {
          booking: booking.id,
          mentorProfile: booking.mentorProfile.id,
          grossCents: booking.priceCents,
          feeBps,
          feeCents,
          netCents,
          currency: booking.currency,
          status: 'held',
          holdReason: 'connect_not_enabled',
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error, PAYOUT_BOOKING_UNIQUE)) {
        return (await this.em.findOne(Payout, { booking: booking.id })) as Payout;
      }

      throw error;
    }
  }

  private fresh(payout: Payout): boolean {
    return this.clock.now().getTime() - payout.updatedAt.getTime() < CLAIM_TIMEOUT_MS;
  }

  private async hold(payout: Payout, reason: HoldReason): Promise<SettleOutcome> {
    await this.em.nativeUpdate(Payout, { id: payout.id, status: { $ne: 'transferred' } }, { status: 'held', holdReason: reason, failureCode: null });

    return 'held';
  }

  private async transferred(payoutId: string, transferId: string): Promise<SettleOutcome> {
    await this.em.nativeUpdate(
      Payout,
      { id: payoutId, status: 'transferring' },
      { status: 'transferred', transferId, transferredAt: this.clock.now(), failureCode: null },
    );

    return 'transferred';
  }
}
