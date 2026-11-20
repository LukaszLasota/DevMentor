"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@devmentor/ui";

/** How often and how long the page re-reads itself while Stripe's confirmation is on its way. */
export const PENDING_POLL_MS = 3_000;
export const PENDING_MAX_POLLS = 20;

/**
 * Waiting for Stripe's webhook (spec #29): the server page is re-read every few seconds for about a
 * minute, then the mentee is told to refresh later. The confirmation itself decides the state.
 */
export function BookingPending() {
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const waiting = polls < PENDING_MAX_POLLS;

  useEffect(() => {
    if (!waiting) {
      return;
    }

    const timer = setTimeout(() => {
      router.refresh();
      setPolls((count) => count + 1);
    }, PENDING_POLL_MS);

    return () => clearTimeout(timer);
  }, [polls, waiting, router]);

  return (
    <Alert>
      <AlertTitle>Waiting for payment confirmation…</AlertTitle>
      <AlertDescription>
        {waiting ? "This page updates by itself." : "This is taking longer than usual — refresh this page in a minute."}
      </AlertDescription>
    </Alert>
  );
}
