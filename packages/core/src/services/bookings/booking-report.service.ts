import { Booking, BOOKING_REPORT_BOOKING_UNIQUE, BookingReport, isUniqueViolation } from '@devmentor/db';
import type { Cradle } from '../../container/cradle';
import { ConflictError, NotFoundError } from '../../http/errors';
import type { BookingReportInput } from '../../validators/bookings/booking-report.schema';
import { BOOKING_NOT_FOUND_MESSAGE } from './booking.service';
import { mentorNameForOperator } from '../mentors/mentor-name';

export const NOT_REPORTABLE_MESSAGE = 'Only a paid booking can be reported.';
export const REPORT_NOT_FOUND_MESSAGE = 'Report not found.';
export const ALREADY_REPORTED_MESSAGE = 'You already reported this booking. The DevMentor team will reply by email.';

/** Bookings a mentee may report: paid ones, before or after a cancellation. */
const REPORTABLE: Booking['status'][] = ['confirmed', 'cancelled'];

/** An open report as `/admin` lists it (operators only). */
export interface ReportItem {
  reportId: string;
  bookingId: string;
  bookingStatus: Booking['status'];
  message: string;
  createdAt: string;
  resolvedAt: string | null;
  startsAt: string;
  menteeEmail: string;
  mentorName: string;
}

/**
 * Dispute reports (spec 2026-11-20-booking-cancellation, phase 2; R10, R16): a mentee writes what went
 * wrong with one of their paid bookings; the operator reads it on `/admin` and is emailed. A report
 * never changes the booking or moves money. The message is shown only to the operator and the mentee,
 * and never logged.
 */
export class BookingReportService {
  private readonly em: Cradle['em'];
  private readonly clock: Cradle['clock'];
  private readonly env: Cradle['env'];
  private readonly logger: Cradle['logger'];
  private readonly events: Cradle['events'];
  private readonly mailSender: Cradle['mailSender'];

  constructor({ em, clock, env, logger, events, mailSender }: Pick<Cradle, 'em' | 'clock' | 'env' | 'logger' | 'events' | 'mailSender'>) {
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.events = events;
    this.mailSender = mailSender;
  }

  /** The mentee reports their own paid booking, once (409 `ALREADY_REPORTED` after that). */
  async report(menteeId: string, bookingId: string, { message }: BookingReportInput): Promise<{ reportedAt: string }> {
    const booking = await this.em.findOne(Booking, { id: bookingId, mentee: menteeId });

    if (booking === null) {
      throw new NotFoundError(BOOKING_NOT_FOUND_MESSAGE);
    }

    if (!REPORTABLE.includes(booking.status)) {
      throw new ConflictError(NOT_REPORTABLE_MESSAGE, { code: 'NOT_REPORTABLE' });
    }

    const alreadyReported = () => new ConflictError(ALREADY_REPORTED_MESSAGE, { code: 'ALREADY_REPORTED' });

    if ((await this.em.findOne(BookingReport, { booking: bookingId })) !== null) {
      throw alreadyReported();
    }

    let report: BookingReport;

    try {
      // Its own fork: a lost race (the unique key) poisons that unit of work only.
      report = await this.em.transactional(async (em) => em.create(BookingReport, { booking: bookingId, message }));
    } catch (error) {
      if (isUniqueViolation(error, BOOKING_REPORT_BOOKING_UNIQUE)) {
        throw alreadyReported();
      }

      throw error;
    }

    await this.events.emit('bookings.booking.reported', { bookingId, reportId: report.id });
    await this.tellOperators(bookingId);

    return { reportedAt: report.createdAt.toISOString() };
  }

  /** `/admin`: every report, newest first, with who and what. */
  async list(): Promise<ReportItem[]> {
    const reports = await this.em.find(
      BookingReport,
      {},
      { populate: ['booking.mentee', 'booking.mentorProfile.user'], orderBy: { createdAt: 'desc' } },
    );

    return reports.map((report) => {
      const booking = report.booking.getEntity();

      return {
        reportId: report.id,
        bookingId: booking.id,
        bookingStatus: booking.status,
        message: report.message,
        createdAt: report.createdAt.toISOString(),
        resolvedAt: report.resolvedAt?.toISOString() ?? null,
        startsAt: booking.startsAt.toISOString(),
        menteeEmail: booking.mentee.getEntity().email,
        mentorName: mentorNameForOperator(booking.mentorProfile.getEntity().displayName, booking.mentorProfile.getEntity().user.getEntity().email),
      };
    });
  }

  /**
   * The operator marks a dispute settled (spec 2026-11-21-mentor-payouts): its booking's payout becomes
   * eligible again. Idempotent: a resolved report keeps its first time.
   */
  async resolve(reportId: string): Promise<{ resolvedAt: string }> {
    const report = await this.em.findOne(BookingReport, { id: reportId });

    if (report === null) {
      throw new NotFoundError(REPORT_NOT_FOUND_MESSAGE);
    }

    if (report.resolvedAt == null) {
      await this.em.nativeUpdate(BookingReport, { id: reportId, resolvedAt: null }, { resolvedAt: this.clock.now() });
      this.em.clear();
    }

    const resolved = (await this.em.findOne(BookingReport, { id: reportId })) as BookingReport;

    return { resolvedAt: (resolved.resolvedAt as Date).toISOString() };
  }

  /** One email per operator address, best effort; the message itself stays on `/admin`. */
  private async tellOperators(bookingId: string): Promise<void> {
    for (const to of this.env.OPERATOR_EMAILS) {
      try {
        await this.mailSender.send({
          to,
          subject: 'A mentee reported a booking',
          text: [`A mentee reported a problem with booking ${bookingId}.`, `${this.env.APP_URL ?? ''}/admin`].join('\n\n'),
        });
      } catch (error) {
        this.logger.error({ booking: { id: bookingId }, err: error }, 'Report email to an operator failed');
      }
    }
  }
}
