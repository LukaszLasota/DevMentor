import { z } from 'zod';

// `POST /api/bookings/[id]/cancel` (spec 2026-11-20-booking-cancellation). The client sends the terms
// it showed the mentee; the server decides the refund itself and refuses when the two differ.

export const EXPECT_REFUND_MESSAGE = 'Confirm the cancellation terms.';

export const bookingCancelSchema = z.object({
  expectRefund: z.boolean(EXPECT_REFUND_MESSAGE),
});

export type BookingCancelInput = z.output<typeof bookingCancelSchema>;
