"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall, Button } from "@devmentor/ui";

/** Asks Stripe again for one booking's refund (same idempotency key: never a second refund), then re-reads the list. */
export function RetryRefundButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    const result = await apiCall<{ refundStatus: string }>(`/api/admin/bookings/${encodeURIComponent(bookingId)}/refund`, { method: "POST" });
    setBusy(false);
    setMessage(result.ok ? `Refund ${result.data.refundStatus}.` : result.error.message);
    router.refresh();
  }

  return (
    <span className="flex items-center justify-end gap-related">
      {message === null ? null : (
        <span role="status" className="text-body-small text-muted-foreground">
          {message}
        </span>
      )}
      <Button size="sm" appearance="outline" disabled={busy} onClick={() => void retry()}>
        {busy ? "Retrying…" : "Retry refund"}
      </Button>
    </span>
  );
}
