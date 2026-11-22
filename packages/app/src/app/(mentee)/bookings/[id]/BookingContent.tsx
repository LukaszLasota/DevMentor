import { notFound } from "next/navigation";
import { formatMoney, withScope } from "@devmentor/core";
import { isAppError, type BookingView } from "@devmentor/core/http";
import { Alert, AlertDescription, AlertTitle, LocalTime } from "@devmentor/ui";
import { requirePageSession } from "@/lib/session";
import { BookingPending } from "./BookingPending";
import { CancelBooking } from "./CancelBooking";
import { ReportProblem } from "./ReportProblem";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The mentee's own booking, or `null` (unknown, malformed or someone else's: one 404 for all). */
async function loadOwn(userId: string, id: string): Promise<BookingView | null> {
  if (!UUID.test(id)) {
    return null;
  }

  try {
    return await withScope(({ bookingService }) => bookingService.getOwn(userId, id));
  } catch (error) {
    if (isAppError(error) && error.status === 404) {
      return null;
    }

    throw error;
  }
}

/**
 * /bookings/[id] body (spec #29, UI/UX): the state of the mentee's own booking after Stripe Checkout.
 * Pending re-reads itself until the webhook lands. A confirmed booking that has not started can be
 * cancelled (spec 2026-11-20-booking-cancellation). No copy promises a response time (R09).
 */
export async function BookingContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageSession(`/bookings/${id}`);
  const booking = await loadOwn(user.id, id);

  if (booking === null) {
    notFound();
  }

  const mentorLink = booking.mentor.slug === null ? null : `/m/${booking.mentor.slug}`;
  const price = formatMoney(booking.priceCents, booking.currency);
  const what = (
    <>
      {booking.lengthMinutes}-minute text session with {booking.mentor.displayName} on <LocalTime iso={booking.startsAt} />
    </>
  );

  return (
    <>
      <h1 className="text-heading-2 font-semibold">Your booking</h1>
      {booking.status === "pending_payment" ? (
        <BookingPending />
      ) : booking.status === "confirmed" ? (
        <>
          <Alert tone="success">
            <AlertTitle>Booked</AlertTitle>
            <AlertDescription>
              <p>{what}.</p>
              <p>You paid {price}. The mentor has been told by email.</p>
              <a href={`/sessions/${booking.id}`} className="text-link underline underline-offset-4">
                Open the session
              </a>
            </AlertDescription>
          </Alert>
          {booking.cancellation === null ? null : (
            <CancelBooking bookingId={booking.id} refundDue={booking.cancellation.refundDue} freeUntil={booking.cancellation.freeUntil} price={price} />
          )}
        </>
      ) : booking.status === "cancelled" ? (
        <Alert>
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            <p>
              {what}. Cancelled on <LocalTime iso={booking.cancelledAt as string} />.
            </p>
            <p>
              {booking.refundStatus === "not_due"
                ? `The ${price} fee was not refunded: the booking was cancelled 24 hours or less before the start.`
                : booking.refundStatus === "failed"
                  ? `We will refund ${price} by hand and email you.`
                  : `Your ${price} is being refunded in full to your card (usually 5–10 days).`}
            </p>
          </AlertDescription>
        </Alert>
      ) : booking.status === "payment_orphaned" ? (
        <Alert tone="warning">
          <AlertTitle>We received your payment but could not keep the time</AlertTitle>
          <AlertDescription>We will contact you by email about it.</AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>This booking was not completed</AlertTitle>
          <AlertDescription>
            {/* "The time may still be open" only next to a page the mentee can open (#86 review). */}
            <p>{mentorLink === null ? "You were not charged." : "You were not charged. The time may still be open."}</p>
            {mentorLink === null ? null : (
              <a href={mentorLink} className="text-link underline underline-offset-4">
                Back to {booking.mentor.displayName}
              </a>
            )}
          </AlertDescription>
        </Alert>
      )}
      {booking.status !== "confirmed" && booking.status !== "cancelled" ? null : booking.reportedAt === null ? (
        <ReportProblem bookingId={booking.id} />
      ) : (
        <p role="status" className="text-body-small text-muted-foreground">
          Reported on <LocalTime iso={booking.reportedAt} />. The DevMentor team will reply by email. Reporting does not refund automatically.
        </p>
      )}
    </>
  );
}
