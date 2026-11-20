import { ACTIVE_BOOKING_SLOT_UNIQUE, Booking, isUniqueViolation, LockMode, MentorProfile, Slot } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import type { SessionLength } from '../../domain/session-lengths';
import { ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../http/errors';
import type { BookingStartInput } from '../../validators/bookings/booking-start.schema';
import { meetsLeadTime } from '../availability/lead-time';
import { activeBookingsWhere } from '../availability/slot.service';
import { mentorOfferReady } from '../mentors/readiness';
import { offerState } from '../mentors/mentor-profile.service';
import type { CheckoutSession } from '../payments/checkout-gateway';
import { endOf, freeLengths } from './occupancy';

/** Stripe's minimum session lifetime is 30 minutes; one more absorbs latency and clock skew. */
export const CHECKOUT_LIFETIME_MS = 31 * 60_000;
/** The hold outlives the Checkout Session, so a payment cannot complete on a released time. */
export const HOLD_GRACE_MS = 5 * 60_000;

export const SLOT_TAKEN_MESSAGE = 'This time was just taken. Pick another one.';
export const NOT_BOOKABLE_MESSAGE = 'This time can no longer be booked.';
export const OWN_SLOT_MESSAGE = 'You cannot book your own time.';
export const PAYMENTS_UNAVAILABLE_MESSAGE = 'Payments are unavailable right now. Nothing was charged; try again later.';
export const SLOT_NOT_FOUND_MESSAGE = 'This time is not available.';
export const BOOKING_NOT_FOUND_MESSAGE = 'Booking not found.';

const slotTaken = () => new ConflictError(SLOT_TAKEN_MESSAGE, { code: 'SLOT_TAKEN' });
const notBookable = () => new ConflictError(NOT_BOOKABLE_MESSAGE, { code: 'NOT_BOOKABLE' });
const paymentsUnavailable = () => new ServiceUnavailableError(PAYMENTS_UNAVAILABLE_MESSAGE, { code: 'PAYMENTS_UNAVAILABLE' });

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
function lockForUpdate() {
  return { lockMode: LockMode.PESSIMISTIC_WRITE, refresh: true } as const;
}

/** What `start` returns: the browser goes to `checkoutUrl`. */
export interface BookingStarted {
  bookingId: string;
  checkoutUrl: string;
}

/** The mentee's own booking (`GET /api/bookings/[id]`, `/bookings/[id]`). */
export interface BookingView {
  id: string;
  status: Booking['status'];
  lengthMinutes: number;
  priceCents: number;
  currency: string;
  startsAt: string;
  mentor: { displayName: string; slug: string | null };
}

/** What a completed Checkout did to its booking. */
export type CompletionOutcome = 'confirmed' | 'already_confirmed' | 'orphaned' | 'ignored';

type StartStep = { kind: 'held'; booking: Booking; displayName: string; slug: string } | { kind: 'release'; booking: Booking };

/**
 * Bookings (spec 2026-11-20-booking-stripe-checkout). A mentee's commit takes a **hold** — a
 * `pending_payment` row — under the mentor profile's row lock, after rechecking everything the server
 * owns; only then is Stripe asked for a Checkout Session, so a second mentee is refused before any
 * charge (AC4). The session expires at one deadline; the hold outlives it by a grace period, and a
 * stale hold is released only after Stripe confirms the session can no longer be paid.
 */
export class BookingService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly slotService: Cradle['slotService'];
  private readonly platformSettingsService: Cradle['platformSettingsService'];
  private readonly checkoutGateway: Cradle['checkoutGateway'];

  constructor({
    em,
    clock,
    env,
    logger,
    slotService,
    platformSettingsService,
    checkoutGateway,
  }: Pick<Cradle, 'em' | 'clock' | 'env' | 'logger' | 'slotService' | 'platformSettingsService' | 'checkoutGateway'>) {
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.slotService = slotService;
    this.platformSettingsService = platformSettingsService;
    this.checkoutGateway = checkoutGateway;
  }

  /**
   * Holds `slotId` for `length` minutes and opens Stripe Checkout for the server-held price. Refusals:
   * 503 `PAYMENTS_UNAVAILABLE` (nothing held), 404 unknown/removed slot or a page that is not public,
   * 403 own slot, 409 `NOT_BOOKABLE` (under two hours, or the mentor is not offer-ready), 409
   * `SLOT_TAKEN` (held, booked, or the length overlaps another booking).
   */
  async start(mentee: { id: string; email: string }, input: BookingStartInput): Promise<BookingStarted> {
    const appUrl = this.env.APP_URL;

    if (!this.checkoutGateway.configured || appUrl === undefined) {
      throw paymentsUnavailable();
    }

    const slot = await this.em.findOne(Slot, { id: input.slotId, removedAt: null });

    if (slot === null) {
      throw new NotFoundError(SLOT_NOT_FOUND_MESSAGE);
    }

    const now = this.clock.now();
    const deadline = new Date(now.getTime() + CHECKOUT_LIFETIME_MS);
    // At most one stale hold is in the way (the unique index allows one per slot): release, then retry once.
    let step = await this.hold(slot.mentorProfile.id, mentee.id, input, now, deadline);

    if (step.kind === 'release') {
      await this.releaseStale(step.booking);
      step = await this.hold(slot.mentorProfile.id, mentee.id, input, now, deadline);

      if (step.kind === 'release') {
        throw slotTaken();
      }
    }

    const { booking, displayName, slug } = step;
    const session = await this.checkoutGateway.createSession({
      bookingId: booking.id,
      amountCents: booking.priceCents,
      currency: booking.currency,
      productName: `${booking.lengthMinutes}-minute text session with ${displayName}`,
      customerEmail: mentee.email,
      expiresAt: deadline,
      successUrl: `${appUrl}/bookings/${booking.id}`,
      cancelUrl: `${appUrl}/m/${slug}?checkout=cancelled`,
    });

    if (session.kind !== 'ok' || session.data.url === null) {
      // Releases the time at once; nothing was charged.
      await this.em.nativeUpdate(Booking, { id: booking.id, status: 'pending_payment' }, { status: 'failed' });
      this.logger.warn({ booking: { id: booking.id }, checkout: session.kind }, 'Checkout could not start; the hold is released');
      throw paymentsUnavailable();
    }

    await this.em.nativeUpdate(Booking, { id: booking.id }, { checkoutSessionId: session.data.id });

    return { bookingId: booking.id, checkoutUrl: session.data.url };
  }

  /** The caller's own booking; anyone else's (or an unknown id) → 404. */
  async getOwn(menteeId: string, bookingId: string): Promise<BookingView> {
    const booking = await this.em.findOne(Booking, { id: bookingId, mentee: menteeId }, { populate: ['mentorProfile'] });

    if (booking === null) {
      throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
    }

    const profile = booking.mentorProfile.getEntity();

    return {
      id: booking.id,
      status: booking.status,
      lengthMinutes: booking.lengthMinutes,
      priceCents: booking.priceCents,
      currency: booking.currency,
      startsAt: booking.startsAt.toISOString(),
      mentor: { displayName: profile.displayName ?? '', slug: profile.slug ?? null },
    };
  }

  /**
   * Applies a completed Checkout Session inside the caller's transaction (`em`), with the booking
   * row locked. Idempotent: a confirmed booking stays as it is. A payment that matches the held
   * snapshot confirms it and records the R09 lead; anything else that was paid (amount or currency
   * mismatch, a booking no longer held, a removed slot) becomes `payment_orphaned` for the operator
   * (R16) — never an automatic refund (R10).
   */
  async applyCompleted(em: Cradle['em'], session: CheckoutSession): Promise<{ outcome: CompletionOutcome; booking: Booking | null }> {
    const booking = session.clientReferenceId === null ? null : await em.findOne(Booking, { id: session.clientReferenceId }, lockForUpdate());

    if (booking === null || session.paymentStatus !== 'paid') {
      this.logger.warn({ checkout: { id: session.id, paymentStatus: session.paymentStatus } }, 'Completed Checkout without a payable booking');

      return { outcome: 'ignored', booking };
    }

    if (booking.status === 'confirmed' || booking.status === 'payment_orphaned') {
      return { outcome: booking.status === 'confirmed' ? 'already_confirmed' : 'orphaned', booking };
    }

    const now = this.clock.now();
    const slot = await em.findOne(Slot, { id: booking.slot.id });
    const matches =
      booking.status === 'pending_payment' &&
      session.amountTotal === booking.priceCents &&
      session.currency === booking.currency &&
      slot !== null &&
      slot.removedAt == null;

    booking.checkoutSessionId ??= session.id;

    if (!matches) {
      booking.status = 'payment_orphaned';
      this.logger.error(
        { booking: { id: booking.id }, checkout: { id: session.id } },
        'Paid Checkout for a booking that is no longer held — operator follow-up (no automatic refund)',
      );

      return { outcome: 'orphaned', booking };
    }

    booking.status = 'confirmed';
    booking.confirmedAt = now;
    booking.leadMinutes = Math.floor((booking.startsAt.getTime() - now.getTime()) / 60_000);

    return { outcome: 'confirmed', booking };
  }

  /** Applies an expired Checkout Session: a booking still held is released; anything else stays. */
  async applyExpired(em: Cradle['em'], session: CheckoutSession): Promise<void> {
    if (session.clientReferenceId === null) {
      return;
    }

    const booking = await em.findOne(Booking, { id: session.clientReferenceId }, lockForUpdate());

    if (booking?.status === 'pending_payment') {
      booking.status = 'expired';
    }
  }

  /** One transaction under the profile lock: recheck, then insert the hold (or report a stale one). */
  private async hold(
    mentorProfileId: string,
    menteeId: string,
    input: BookingStartInput,
    now: Date,
    deadline: Date,
  ): Promise<StartStep> {
    try {
      return await this.em.transactional(async (em) => {
        const profile = await em.findOne(MentorProfile, { id: mentorProfileId }, { ...lockForUpdate(), populate: ['user'] });
        const slot = await em.findOne(Slot, { id: input.slotId, mentorProfile: mentorProfileId, removedAt: null });
        const owner = profile?.user.getEntity();

        if (profile === null || slot === null || owner === undefined || !owner.roles.includes('mentor')) {
          throw new NotFoundError(SLOT_NOT_FOUND_MESSAGE);
        }

        if (owner.id === menteeId) {
          throw new ForbiddenError(OWN_SLOT_MESSAGE);
        }

        const settings = this.platformSettingsService.tryGet();
        const bookable = await this.slotService.countBookable(profile.id, now);

        if (!meetsLeadTime(slot.startsAt, now) || settings === null || !mentorOfferReady.isMet(offerState(profile, bookable, settings))) {
          throw notBookable();
        }

        const stale = await em.findOne(Booking, { slot: slot.id, status: 'pending_payment', holdExpiresAt: { $lte: now } });

        if (stale !== null) {
          return { kind: 'release', booking: stale };
        }

        const busy = await em.find(Booking, activeBookingsWhere([profile.id], now));

        if (!freeLengths(slot.startsAt, busy).includes(input.length)) {
          throw slotTaken();
        }

        const booking = em.create(Booking, {
          slot,
          mentorProfile: profile,
          mentee: menteeId,
          startsAt: slot.startsAt,
          endsAt: endOf(slot.startsAt, input.length),
          lengthMinutes: Number(input.length),
          priceCents: priceOf(profile, input.length),
          currency: settings.currency,
          status: 'pending_payment',
          holdExpiresAt: new Date(deadline.getTime() + HOLD_GRACE_MS),
        });

        return { kind: 'held', booking, displayName: profile.displayName as string, slug: profile.slug as string };
      });
    } catch (error) {
      // The index backs the lock: a hold this transaction could not see still loses cleanly.
      if (isUniqueViolation(error, ACTIVE_BOOKING_SLOT_UNIQUE)) {
        throw slotTaken();
      }

      throw error;
    }
  }

  /**
   * A hold past its deadline is released only once Stripe says its session can no longer be paid: a
   * session that completed meanwhile (a late webhook) is confirmed instead, and the time stays taken.
   * When Stripe cannot answer, the time stays taken — never sold twice.
   */
  private async releaseStale(stale: Booking): Promise<void> {
    if (stale.checkoutSessionId == null) {
      // Checkout never opened for it (the process died in between): nothing can be paid.
      await this.em.nativeUpdate(Booking, { id: stale.id, status: 'pending_payment' }, { status: 'expired' });

      return;
    }

    const result = await this.checkoutGateway.expireSession(stale.checkoutSessionId);

    if (result.kind !== 'ok' || result.data.status === 'open') {
      this.logger.warn({ booking: { id: stale.id }, checkout: result.kind }, 'Could not release a stale hold; the time stays taken');
      throw slotTaken();
    }

    const session = result.data;

    if (session.status === 'complete') {
      await this.em.transactional((em) => this.applyCompleted(em, session));
      throw slotTaken();
    }

    await this.em.transactional((em) => this.applyExpired(em, session));
  }
}

function priceOf(profile: MentorProfile, length: SessionLength): number {
  // mentorOfferReady guarantees both prices are set and within bounds.
  return (length === '25' ? profile.price25Cents : profile.price50Cents) as number;
}
