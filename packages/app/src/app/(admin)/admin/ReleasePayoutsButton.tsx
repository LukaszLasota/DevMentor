"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReleaseResult } from "@devmentor/core/http";
import { apiCall, Button } from "@devmentor/ui";

/** Runs one payout release (operator, R16) and says what it did; the list re-reads after. */
export function ReleasePayoutsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function release() {
    setBusy(true);
    const result = await apiCall<ReleaseResult>("/api/admin/payouts/release", { method: "POST" });
    setBusy(false);

    if (result.ok) {
      const { transferred, held, failed, inFlight, remaining } = result.data;
      setMessage(
        `Transferred ${transferred}, held ${held}, failed ${failed}, in progress ${inFlight}.${remaining > 0 ? ` ${remaining} more due — release again.` : ""}`,
      );
    } else {
      setMessage(result.error.message);
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-related">
      <Button disabled={busy} onClick={() => void release()}>
        {busy ? "Releasing…" : "Release payouts"}
      </Button>
      {message === null ? null : (
        <p role="status" className="text-body-small text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
