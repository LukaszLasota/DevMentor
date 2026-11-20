import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/postgresql';
import { BookingSchema } from './booking.entity';

/** A report is a few sentences, not an essay (spec 2026-11-20-booking-cancellation, Q7). */
export const BOOKING_REPORT_MESSAGE_MIN = 20;
export const BOOKING_REPORT_MESSAGE_MAX = 2000;
export const BOOKING_REPORT_MESSAGE_CHECK = `char_length(message) between ${BOOKING_REPORT_MESSAGE_MIN} and ${BOOKING_REPORT_MESSAGE_MAX}`;

/** Named so `BookingReportService` maps a second report on one booking (and only that) to 409. */
export const BOOKING_REPORT_BOOKING_UNIQUE = 'booking_reports_booking_id_unique';

/**
 * A mentee's dispute report about one of their bookings (R10: disputes go to the operator, never an
 * automatic refund). One per booking. `message` is free text about a person: shown only to the
 * operator and the reporting mentee, never logged.
 */
export const BookingReportSchema = defineEntity({
  name: 'BookingReport',
  tableName: 'booking_reports',
  checks: [{ name: 'booking_reports_message_check', expression: BOOKING_REPORT_MESSAGE_CHECK }],
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    booking: () => p.oneToOne(BookingSchema).owner().ref().deleteRule('restrict'),
    message: p.text(),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** Set by the operator once the dispute is settled; an unresolved report holds the payout. */
    resolvedAt: p.datetime().nullable(),
  },
});

export class BookingReport extends BookingReportSchema.class {}

BookingReportSchema.setClass(BookingReport);
