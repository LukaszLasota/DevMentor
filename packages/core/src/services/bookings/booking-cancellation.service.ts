import { Booking, MentorProfile, type RefundStatus } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ConflictError, NotFoundError } from '../../http/errors';
import type { MailMessage } from '../../mail/mail-sender';
import { formatMoney } from '../../money/money';
import type { BookingCancelInput } from '../../validators/bookings/booking-cancel.schema';
import { BOOKING_NOT_FOUND_MESSAGE, type BookingView, lockForUpdate, utcLabel } from './booking.service';
import { cancellationTerms } from './cancellation-terms';

export const NOT_CANCELLABLE_MESSAGE = 'This booking can no longer be cancelled.';
export const TERMS_CHANGED_MESSAGE = 'The cancellation terms changed. Check them and confirm again.';
export const REFUND_NOT_DUE_MESSAGE = 'This booking has no refund to retry.';

/** Refunds the operator still has to see through (`/admin`). */
const OPEN_REFUNDS: RefundStatus[] = ['requested', 'pending', 'failed'];

/** A booking `/admin` lists under "Needs attention" (operators only). */
export interface AttentionItem {
  bookingId: string;
  status: Booking['status'];
  refundStatus: RefundStatus | null;
  refundId: string | null;
  checkoutSessionId: string | null;
  priceCents: number;
  currency: string;
  startsAt: string;
  cancelledAt: string | null;
  menteeEmail: string;
  mentorName: string;
}

/**
 * Cancellation (spec 2026-11-20-booking-cancellation, R10). The decision — cancelled, refund due or
 * forfeited — commits under the mentor profile lock (the same order as booking); the refund is one
 * idempotent Stripe call after commit, so a Stripe outage never costs the mentee a free cancellation.
 * A refund Stripe may or may not have taken stays `requested`; only a definite refusal is `failed`.
 * Anything not succeeded is on `/admin`, where the operator retries it or finishes it by hand (R16).
 */
export class BookingCancellationService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly checkoutGateway: Cradle['checkoutGateway'];
  private readonly events: Cradle['events'];
  private readonly mailSender: Cradle['mailSender'];
  private readonly bookingService: Cradle['bookingService'];

  constructor({
    em,
    clock,
    env,
    logger,
    checkoutGateway,
    events,
    mailSender,
    bookingService,
  }: Pick<Cradle, 'em' | 'clock' | 'env' | 'logger' | 'checkoutGateway' | 'events' | 'mailSender' | 'bookingService'>) {
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.checkoutGateway = checkoutGateway;
    this.events = events;
    this.mailSender = mailSender;
    this.bookingService = bookingService;
  }

  /**
   * The mentee cancels their own confirmed booking before it starts. `expectRefund` is what the page
   * showed; a different server decision (the 24-hour line passed meanwhile) is refused with 409
   * `CANCELLATION_TERMS_CHANGED` and changes nothing (AC2). A repeat returns the booking and retries a
   * refund still `requested`.
   */
  async cancel(menteeId: string, bookingId: string, { expectRefund }: BookingCancelInput): Promise<BookingView> {
    const cancelledNow = await this.em.transactional(async (em) => {
      const found = await em.findOne(Booking, { id: bookingId, mentee: menteeId });

      if (found === null) {
        throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
      }

      await em.findOne(MentorProfile, { id: found.mentorProfile.id }, lockForUpdate());
      const booking = (await em.findOne(Booking, { id: found.id }, lockForUpdate())) as Booking;

      if (booking.status === 'cancelled') {
        return false;
      }

      const now = this.clock.now();

      if (booking.status !== 'confirmed' || booking.startsAt.getTime() <= now.getTime()) {
        throw new ConflictError(NOT_CANCELLABLE_MESSAGE, { code: 'NOT_CANCELLABLE' });
      }

      const { refundDue } = cancellationTerms(booking.startsAt, now);

      if (refundDue !== expectRefund) {
        throw new ConflictError(TERMS_CHANGED_MESSAGE, { code: 'CANCELLATION_TERMS_CHANGED' });
      }

      booking.status = 'cancelled';
      booking.cancelledAt = now;
      booking.refundStatus = refundDue ? 'requested' : 'not_due';

      return true;
    });
    // The transaction ran in its own fork; read the committed state, not this scope's cached row.
    this.em.clear();

    await this.requestRefund(bookingId);

    if (cancelledNow) {
      await this.announceCancelled(bookingId);
    }

    return this.bookingService.getOwn(menteeId, bookingId);
  }

  /**
   * Operator (`/admin`): asks Stripe again for a refund still `requested` or `failed` (same idempotency
   * key, never a second refund), or re-reads a `pending` one. Returns the refund status afterwards.
   */
  async retryRefund(bookingId: string): Promise<{ refundStatus: RefundStatus }> {
    const booking = await this.em.findOne(Booking, { id: bookingId });

    if (booking === null) {
      throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
    }

    if (booking.status !== 'cancelled' || !OPEN_REFUNDS.includes(booking.refundStatus as RefundStatus)) {
      throw new ConflictError(REFUND_NOT_DUE_MESSAGE, { code: 'REFUND_NOT_DUE' });
    }

    if (booking.refundStatus === 'pending' && booking.refundId != null) {
      const refund = await this.checkoutGateway.getRefund(booking.refundId);

      if (refund.kind === 'ok') {
        await this.em.nativeUpdate(Booking, { id: booking.id, refundStatus: 'pending' }, { refundStatus: refund.data.status });
      }
    } else {
      await this.requestRefund(booking.id);
    }

    this.em.clear();
    const after = (await this.em.findOne(Booking, { id: bookingId })) as Booking;

    return { refundStatus: after.refundStatus as RefundStatus };
  }

  /** `/admin` "Needs attention": cancelled bookings whose refund is not done, and orphaned payments. */
  async needsAttention(): Promise<AttentionItem[]> {
    const bookings = await this.em.find(
      Booking,
      { $or: [{ status: 'cancelled', refundStatus: { $in: OPEN_REFUNDS } }, { status: 'payment_orphaned' }] },
      { populate: ['mentorProfile', 'mentee'], orderBy: { startsAt: 'asc' } },
    );

    return bookings.map((booking) => ({
      bookingId: booking.id,
      status: booking.status,
      refundStatus: booking.refundStatus ?? null,
      refundId: booking.refundId ?? null,
      checkoutSessionId: booking.checkoutSessionId ?? null,
      priceCents: booking.priceCents,
      currency: booking.currency,
      startsAt: booking.startsAt.toISOString(),
      cancelledAt: booking.cancelledAt?.toISOString() ?? null,
      menteeEmail: booking.mentee.getEntity().email,
      mentorName: booking.mentorProfile.getEntity().displayName ?? '',
    }));
  }

  /**
   * One full refund for a cancelled booking whose refund is `requested` or `failed`. The outcome is
   * written only over those states, so a concurrent retry cannot move a settled refund backwards.
   */
  private async requestRefund(bookingId: string): Promise<void> {
    const booking = await this.em.findOne(Booking, { id: bookingId });

    if (booking?.status !== 'cancelled' || (booking.refundStatus !== 'requested' && booking.refundStatus !== 'failed')) {
      return;
    }

    const result = await this.checkoutGateway.refund({ bookingId, sessionId: booking.checkoutSessionId as string });
    const open = { id: bookingId, refundStatus: { $in: ['requested', 'failed'] as RefundStatus[] } };

    if (result.kind === 'ok') {
      await this.em.nativeUpdate(Booking, open, { refundStatus: result.data.status, refundId: result.data.id ?? booking.refundId ?? null });
    } else if (result.kind === 'rejected' || result.kind === 'idempotency_mismatch') {
      await this.em.nativeUpdate(Booking, open, { refundStatus: 'failed' });
      this.logger.error({ booking: { id: bookingId }, refund: result }, 'Stripe refused the refund — operator follow-up (R16)');
    } else {
      // Stripe may have taken it (timeout, 5xx) or never saw it: stays `requested`, retried with the same key.
      this.logger.warn({ booking: { id: bookingId }, refund: { kind: result.kind } }, 'Refund not confirmed by Stripe; stays requested');
    }
  }

  /** After the cancellation commits: the event, then one email to the mentee and one to the mentor (best effort). */
  private async announceCancelled(bookingId: string): Promise<void> {
    const booking = (await this.em.findOne(Booking, { id: bookingId }, { populate: ['mentorProfile.user', 'mentee'] })) as Booking;

    await this.events.emit('bookings.booking.cancelled', {
      bookingId: booking.id,
      mentorProfileId: booking.mentorProfile.id,
      menteeId: booking.mentee.id,
      startsAt: booking.startsAt,
      refundDue: booking.refundStatus !== 'not_due',
    });

    for (const message of cancellationMails(booking, this.env.APP_URL ?? '')) {
      try {
        await this.mailSender.send(message);
      } catch (error) {
        this.logger.error({ booking: { id: booking.id }, err: error }, 'Booking cancellation email failed');
      }
    }
  }
}

/** The two cancellation emails (mentee, then mentor). Plain text; no response-time wording (R09). */
export function cancellationMails(booking: Booking, appUrl: string): MailMessage[] {
  const profile = booking.mentorProfile.getEntity();
  const when = utcLabel(booking.startsAt);
  const length = `${booking.lengthMinutes}-minute`;
  const price = formatMoney(booking.priceCents, booking.currency);
  const refund =
    booking.refundStatus === 'not_due'
      ? `The ${price} fee is not refunded: the booking was cancelled 24 hours or less before the start.`
      : `Your ${price} is being refunded in full to your card (usually 5–10 days).`;

  return [
    {
      to: booking.mentee.getEntity().email,
      subject: `Cancelled: ${length} session with ${profile.displayName ?? 'your mentor'}`,
      text: [`You cancelled your ${length} text session on ${when}.`, refund, `${appUrl}/bookings/${booking.id}`].join('\n\n'),
    },
    {
      to: profile.user.getEntity().email,
      subject: `Cancelled: ${length} session on ${when}`,
      text: [
        `The mentee cancelled the ${length} text session on ${when}. The time is open for booking again while it is at least two hours away.`,
        `${appUrl}/mentor/slots`,
      ].join('\n\n'),
    },
  ];
}
