import { z } from 'zod';

// `POST /api/bookings/[id]/report` (spec 2026-11-20-booking-cancellation, phase 2): what went wrong, in
// a few sentences. Bounds mirror the `booking_reports_message_check` constraint (20–2000 characters).

export const REPORT_MESSAGE_MIN = 20;
export const REPORT_MESSAGE_MAX = 2000;
export const REPORT_MESSAGE_MESSAGE = `Describe the problem in ${REPORT_MESSAGE_MIN} to ${REPORT_MESSAGE_MAX} characters.`;

export const bookingReportSchema = z.object({
  message: z.string(REPORT_MESSAGE_MESSAGE).trim().min(REPORT_MESSAGE_MIN, REPORT_MESSAGE_MESSAGE).max(REPORT_MESSAGE_MAX, REPORT_MESSAGE_MESSAGE),
});

export type BookingReportInput = z.output<typeof bookingReportSchema>;
