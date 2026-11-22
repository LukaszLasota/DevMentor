import { ACTIVE_BOOKING_SLOT_UNIQUE, Booking, BookingReport, isUniqueViolation, User, LockMode, MentorProfile, type RefundStatus, Slot } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import type { SessionLength } from '../../domain/session-lengths';
import { ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../http/errors';
import type { MailMessage } from '../../mail/mail-sender';
import { formatMoney } from '../../money/money';
import type { BookingStartInput } from '../../validators/bookings/booking-start.schema';
import { meetsLeadTime } from '../availability/lead-time';
import { activeBookingsWhere } from '../availability/slot.service';
import { mentorOfferReady } from '../mentors/readiness';
import { offerState } from '../mentors/mentor-profile.service';
import type { CheckoutSession } from '../payments/checkout-gateway';
import { cancellationTerms } from './cancellation-terms';
import { endOf, freeLengths, overlaps } from './occupancy';
import { mentorNameForMentee, mentorNameForMenteeInSentence } from '../mentors/mentor-name';

/** Stripe's minimum session lifetime is 30 minutes; one more absorbs latency and clock skew. */
export const CHECKOUT_LIFETIME_MS = 31 * 60_000;
/** The hold outlives the Checkout Session, so a payment cannot complete on a released time. */
export const HOLD_GRACE_MS = 5 * 60_000;

export const SLOT_TAKEN_MESSAGE = 'This time was just taken. Pick another one.';
export const NOT_BOOKABLE_MESSAGE = 'This time can no longer be booked.';
export const OWN_SLOT_MESSAGE = 'You cannot book your own time.';
export const PAYMENTS_UNAVAILABLE_MESSAGE = 'Payments are unavailable right now. Nothing was charged; try again later.';
export const HOLD_IN_PROGRESS_MESSAGE = 'You are already paying for another time. Finish or cancel that payment first.';
export const SLOT_NOT_FOUND_MESSAGE = 'This time is not available.';
export const BOOKING_NOT_FOUND_MESSAGE = 'Booking not found.';

const slotTaken = () => new ConflictError(SLOT_TAKEN_MESSAGE, { code: 'SLOT_TAKEN' });
const notBookable = () => new ConflictError(NOT_BOOKABLE_MESSAGE, { code: 'NOT_BOOKABLE' });
const paymentsUnavailable = () => new ServiceUnavailableError(PAYMENTS_UNAVAILABLE_MESSAGE, { code: 'PAYMENTS_UNAVAILABLE' });

/** `SELECT … FOR UPDATE` that re-reads the row (lesson 2026-10-26); built at call time. */
export function lockForUpdate() {
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
  /** What cancelling now means (spec 2026-11-20-booking-cancellation); `null` unless it can be cancelled. */
  cancellation: { refundDue: boolean; freeUntil: string } | null;
  cancelledAt: string | null;
  refundStatus: RefundStatus | null;
  /** When the mentee reported a dispute about it, or `null` (phase 2 of the cancellation spec). */
  reportedAt: string | null;
}

/** What a completed Checkout did to its booking. */
export type CompletionOutcome = 'confirmed' | 'already_confirmed' | 'orphaned' | 'ignored';

type StartStep = { kind: 'held'; booking: Booking; displayName: string; slug: string } | { kind: 'release'; bookings: Booking[] };

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
  private readonly events: Cradle['events'];
  private readonly mailSender: Cradle['mailSender'];

  constructor({
    em,
    clock,
    env,
    logger,
    slotService,
    platformSettingsService,
    checkoutGateway,
    events,
    mailSender,
  }: Pick<
    Cradle,
    'em' | 'clock' | 'env' | 'logger' | 'slotService' | 'platformSettingsService' | 'checkoutGateway' | 'events' | 'mailSender'
  >) {
    this.events = events;
    this.mailSender = mailSender;
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

    // One hold per mentee (security report 2026-11-21): a new Book releases the mentee's earlier
    // unpaid hold first, through Stripe like Cancel does (a payment that beat it is confirmed instead).
    for (const own of await this.em.find(Booking, { mentee: mentee.id, status: 'pending_payment', holdExpiresAt: { $gt: now } })) {
      await this.releaseOwnHold(mentee.id, own.id);
    }

    // Expired holds overlapping the wanted time are released (each through Stripe), then retry once.
    let step = await this.hold(slot.mentorProfile.id, mentee.id, input, now, deadline);

    if (step.kind === 'release') {
      for (const stale of step.bookings) {
        await this.releaseStale(stale);
      }

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
      cancelUrl: `${appUrl}/m/${slug}?checkout=cancelled&booking=${booking.id}`,
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

  /**
   * The mentee left Stripe with Cancel: release their own hold now instead of after the deadline, so
   * the time (and their own retry) is open again. Stripe is asked first — a session paid meanwhile is
   * confirmed instead. Anything but the caller's own held booking is left alone; returns its view.
   */
  async releaseOwnHold(menteeId: string, bookingId: string): Promise<BookingView> {
    const booking = await this.em.findOne(Booking, { id: bookingId, mentee: menteeId });

    if (booking === null) {
      throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
    }

    if (booking.status === 'pending_payment' && booking.checkoutSessionId != null) {
      const result = await this.checkoutGateway.expireSession(booking.checkoutSessionId);

      if (result.kind === 'ok' && result.data.status === 'complete') {
        const session = result.data;
        const { outcome } = await this.em.transactional((em) => this.applyCompleted(em, session));
        // The transaction ran in its own fork; read the committed state, not this scope's cached row.
        this.em.clear();

        if (outcome === 'confirmed') {
          await this.announceConfirmed(booking.id);
        }
      } else if (result.kind === 'ok' && result.data.status === 'expired') {
        const session = result.data;
        await this.em.transactional((em) => this.applyExpired(em, session));
      }

      // The transaction ran in its own fork; read the committed state, not this scope's cached row.
      this.em.clear();
    }

    return this.getOwn(menteeId, bookingId);
  }

  /** The caller's own booking; anyone else's (or an unknown id) → 404. */
  async getOwn(menteeId: string, bookingId: string): Promise<BookingView> {
    const booking = await this.em.findOne(Booking, { id: bookingId, mentee: menteeId }, { populate: ['mentorProfile'] });

    if (booking === null) {
      throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
    }

    const profile = booking.mentorProfile.getEntity();
    const now = this.clock.now();
    const terms = cancellationTerms(booking.startsAt, now);
    const cancellable = booking.status === 'confirmed' && booking.startsAt.getTime() > now.getTime();
    const report = await this.em.findOne(BookingReport, { booking: booking.id });

    return {
      id: booking.id,
      status: booking.status,
      lengthMinutes: booking.lengthMinutes,
      priceCents: booking.priceCents,
      currency: booking.currency,
      startsAt: booking.startsAt.toISOString(),
      // A link only to a page that is public now (#86); a name never blank (#85).
      mentor: { displayName: mentorNameForMentee(profile.displayName), slug: profile.publishedAt != null ? (profile.slug ?? null) : null },
      cancellation: cancellable ? { refundDue: terms.refundDue, freeUntil: terms.freeUntil.toISOString() } : null,
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      refundStatus: booking.refundStatus ?? null,
      reportedAt: report?.createdAt.toISOString() ?? null,
    };
  }

  /**
   * Applies a completed Checkout Session inside the caller's transaction (`em`), with the booking
   * row locked. Idempotent: a confirmed booking stays as it is. A payment that matches the held
   * snapshot confirms it and records the R09 lead; anything else that was paid (amount or currency
   * mismatch, a booking no longer held, a removed slot, a time another active booking now overlaps)
   * becomes `payment_orphaned` for the operator (R16) — never an automatic refund (R10). The mentor
   * profile row is locked first, in the same order as booking, so the overlap check cannot race a hold.
   */
  async applyCompleted(em: Cradle['em'], session: CheckoutSession): Promise<{ outcome: CompletionOutcome; booking: Booking | null }> {
    const found = session.clientReferenceId === null ? null : await em.findOne(Booking, { id: session.clientReferenceId });

    if (found !== null) {
      await em.findOne(MentorProfile, { id: found.mentorProfile.id }, lockForUpdate());
    }

    const booking = found === null ? null : await em.findOne(Booking, { id: found.id }, lockForUpdate());

    if (booking === null || session.paymentStatus !== 'paid') {
      this.logger.warn({ checkout: { id: session.id, paymentStatus: session.paymentStatus } }, 'Completed Checkout without a payable booking');

      return { outcome: 'ignored', booking };
    }

    if (booking.status === 'confirmed' || booking.status === 'payment_orphaned') {
      return { outcome: booking.status === 'confirmed' ? 'already_confirmed' : 'orphaned', booking };
    }

    // A cancelled booking was confirmed once and may be refunded: a redelivered completion must not
    // turn it into `payment_orphaned` (spec 2026-11-20-booking-cancellation).
    if (booking.status === 'cancelled') {
      return { outcome: 'ignored', booking };
    }

    const now = this.clock.now();
    const slot = await em.findOne(Slot, { id: booking.slot.id });
    const others = await em.find(Booking, { ...activeBookingsWhere([booking.mentorProfile.id], now), id: { $ne: booking.id } });
    const matches =
      booking.status === 'pending_payment' &&
      session.amountTotal === booking.priceCents &&
      session.currency === booking.currency &&
      slot !== null &&
      slot.removedAt == null &&
      !others.some((other) => overlaps(other, booking));

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
    // The fee rate at payment time (spec 2026-11-21-mentor-payouts): later changes never touch it.
    booking.feeBps = this.env.PLATFORM_FEE_BPS;
    booking.leadMinutes = Math.floor((booking.startsAt.getTime() - now.getTime()) / 60_000);

    return { outcome: 'confirmed', booking };
  }

  /**
   * After a confirmation commits: `bookings.booking.confirmed`, then one email to the mentee and one
   * to the mentor (spec Q5). Each mail is best effort — a delivery failure is logged and never undoes
   * or retries the booking. No copy promises a response time (R09).
   */
  async announceConfirmed(bookingId: string): Promise<void> {
    const booking = await this.em.findOne(Booking, { id: bookingId }, { populate: ['mentorProfile.user', 'mentee'] });

    if (booking === null || booking.status !== 'confirmed') {
      return;
    }

    const profile = booking.mentorProfile.getEntity();
    await this.events.emit('bookings.booking.confirmed', {
      bookingId: booking.id,
      mentorProfileId: profile.id,
      menteeId: booking.mentee.id,
      startsAt: booking.startsAt,
      leadMinutes: booking.leadMinutes as number,
    });

    for (const message of confirmationMails(booking, this.env.APP_URL ?? '')) {
      try {
        await this.mailSender.send(message);
      } catch (error) {
        this.logger.error({ booking: { id: booking.id }, err: error }, 'Booking confirmation email failed');
      }
    }
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
        // The mentee's row first: serializes their starts, so two tabs cannot each take a hold.
        await em.findOne(User, { id: menteeId }, lockForUpdate());

        if ((await em.count(Booking, { mentee: menteeId, status: 'pending_payment', holdExpiresAt: { $gt: now } })) > 0) {
          throw new ConflictError(HOLD_IN_PROGRESS_MESSAGE, { code: 'HOLD_IN_PROGRESS' });
        }

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

        if (!meetsLeadTime(slot.startsAt, now) || settings === null) {
          throw notBookable();
        }

        // Expired holds on this slot or overlapping the wanted time, on any slot of the mentor: each may
        // still be paid (a late webhook), so none is ignored before Stripe says it can no longer be.
        const stale = await em.find(Booking, {
          mentorProfile: profile.id,
          status: 'pending_payment',
          holdExpiresAt: { $lte: now },
          startsAt: { $lt: endOf(slot.startsAt, input.length) },
          endsAt: { $gt: slot.startsAt },
        });

        if (stale.length > 0) {
          return { kind: 'release', bookings: stale };
        }

        const busy = await em.find(Booking, activeBookingsWhere([profile.id], now));

        if (!freeLengths(slot.startsAt, busy).includes(input.length)) {
          throw slotTaken();
        }

        // After the taken check: a rival's hold on the mentor's only time must read as SLOT_TAKEN, not as
        // the mentor dropping out of offer-readiness (which counts free times).
        const bookable = await this.slotService.countBookable(profile.id, now, em);

        if (!mentorOfferReady.isMet(offerState(profile, bookable, settings))) {
          throw notBookable();
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
      const { outcome } = await this.em.transactional((em) => this.applyCompleted(em, session));

      // Its webhook will find it confirmed and stay silent, so this path announces it.
      if (outcome === 'confirmed') {
        this.em.clear();
        await this.announceConfirmed(stale.id);
      }

      throw slotTaken();
    }

    await this.em.transactional((em) => this.applyExpired(em, session));
  }
}

/** `2026-06-23 09:00 UTC`: email clients cannot show the reader's zone, the app can. */
export function utcLabel(instant: Date): string {
  return `${instant.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** The two confirmation emails (mentee, then mentor). Plain text; no response-time wording (R09). */
export function confirmationMails(booking: Booking, appUrl: string): MailMessage[] {
  const profile = booking.mentorProfile.getEntity();
  const mentor = profile.user.getEntity();
  const when = utcLabel(booking.startsAt);
  const length = `${booking.lengthMinutes}-minute`;
  const localTime = 'Open DevMentor to see it in your time zone.';

  return [
    {
      to: booking.mentee.getEntity().email,
      subject: `Booked: ${length} session with ${mentorNameForMenteeInSentence(profile.displayName)}`,
      text: [
        `Your ${length} text session with ${mentorNameForMenteeInSentence(profile.displayName)} is booked for ${when}. ${localTime}`,
        `You paid ${formatMoney(booking.priceCents, booking.currency)}.`,
        `${appUrl}/bookings/${booking.id}`,
      ].join('\n\n'),
    },
    {
      to: mentor.email,
      subject: `New booking: ${length} session on ${when}`,
      text: [
        `A mentee booked a ${length} text session with you for ${when}. ${localTime}`,
        `${appUrl}/mentor/slots`,
      ].join('\n\n'),
    },
  ];
}

function priceOf(profile: MentorProfile, length: SessionLength): number {
  // mentorOfferReady guarantees both prices are set and within bounds.
  return (length === '25' ? profile.price25Cents : profile.price50Cents) as number;
}
