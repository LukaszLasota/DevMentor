"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall } from "@devmentor/ui/mentors";

/**
 * Back from Stripe with Cancel (spec #29): nothing was charged. The mentee's own hold is released
 * right away (`POST /api/bookings/[id]/release`) and the open times are re-read, so the time — and
 * their own retry — is available again without waiting for the payment window to end.
 */
export function CheckoutCancelled({ bookingId }: { bookingId: string | null }) {
  const router = useRouter();
  const [released, setReleased] = useState(false);

  useEffect(() => {
    if (bookingId === null) {
      return;
    }

    void apiCall(`/api/bookings/${encodeURIComponent(bookingId)}/release`, { method: "POST" }).then((result) => {
      if (result.ok) {
        setReleased(true);
        router.refresh();
      }
    });
  }, [bookingId, router]);

  return (
    <p role="status" className="rounded-control bg-muted px-paragraph py-related text-body-small text-foreground">
      Payment cancelled. Nothing was charged.{released ? " The time is open again." : ""}
    </p>
  );
}
