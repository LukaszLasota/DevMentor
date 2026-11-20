"use client";

import { useRouter } from "next/navigation";
import { apiCall, formatInstant, SlotBookingControls, type BookingLength } from "@devmentor/ui/mentors";

export interface BookSlotProps {
  slug: string;
  slotId: string;
  startsAt: string;
  lengths: readonly BookingLength[];
  /** Preformatted by the server page (formatMoney). */
  prices: Record<BookingLength, string>;
}

/** Codes after which the list on this page is stale (the time was taken or is no longer bookable). */
const REFRESH_CODES = new Set(["SLOT_TAKEN", "NOT_BOOKABLE", "NOT_FOUND"]);

/**
 * Booking for one open time on /m/[slug] (spec #29): `POST /api/bookings`, then the browser goes to
 * Stripe Checkout. The page reads no session (it is public and cached per request): a signed-out
 * visitor learns it from the 401 and is sent to sign-in, returning to this page.
 */
export function BookSlot({ slug, slotId, startsAt, lengths, prices }: BookSlotProps) {
  const router = useRouter();

  async function book(length: BookingLength): Promise<string | null> {
    const result = await apiCall<{ bookingId: string; checkoutUrl: string }>("/api/bookings", {
      method: "POST",
      body: { slotId, length },
    });

    if (result.ok) {
      window.location.assign(result.data.checkoutUrl);
      return null;
    }

    if (result.error.code === "UNAUTHORIZED") {
      router.push(`/sign-in?returnTo=${encodeURIComponent(`/m/${slug}`)}`);
      return null;
    }

    if (REFRESH_CODES.has(result.error.code)) {
      router.refresh();
    }

    return result.error.message;
  }

  return <SlotBookingControls lengths={lengths} prices={prices} timeLabel={`${formatInstant(startsAt, "datetime", "UTC")} UTC`} onBook={book} />;
}
