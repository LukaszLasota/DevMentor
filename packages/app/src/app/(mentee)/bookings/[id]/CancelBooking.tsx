"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  apiCall,
  Button,
  LocalTime,
} from "@devmentor/ui";

export interface CancelBookingProps {
  bookingId: string;
  /** The server's terms right now (`GET /api/bookings/[id]` `cancellation`). */
  refundDue: boolean;
  freeUntil: string;
  /** The paid amount, formatted. */
  price: string;
}

/**
 * Cancel on /bookings/[id] (spec 2026-11-20-booking-cancellation, AC1/AC2): the terms are shown before
 * the button and again in the confirm dialog; the request carries them, and when the 24-hour line
 * passed meanwhile the server refuses and the page re-reads the new terms.
 */
export function CancelBooking({ bookingId, refundDue, freeUntil, price }: CancelBookingProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await apiCall(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: "POST",
      body: { expectRefund: refundDue },
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error.message);
    }

    router.refresh();
  }

  return (
    <div className="flex flex-col gap-related">
      <p className="text-body-small text-muted-foreground">
        {refundDue ? (
          <>
            Free cancellation until <LocalTime iso={freeUntil} />. You get {price} back in full.
          </>
        ) : (
          <>Cancelling now forfeits the {price} fee (less than 24 hours before the session).</>
        )}
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button intent="destructive" appearance="outline" className="w-fit" disabled={busy}>
            {busy ? "Cancelling…" : "Cancel booking"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {refundDue ? `You will get ${price} back in full.` : `You will not get the ${price} fee back.`} The time is offered to other mentees again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancel()}>Cancel booking</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error === null ? null : (
        <p role="alert" className="text-body-small text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
