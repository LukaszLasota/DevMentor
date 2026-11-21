"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall, Button } from "@devmentor/ui";

/**
 * Set up / Continue onboarding (a fresh Stripe link, then the browser leaves for Stripe) and Refresh
 * status (re-read at Stripe, then the page re-renders the stored state).
 */
export function ConnectActions({ status }: { status: "action_required" | "pending_verification" | "enabled" | "restricted" | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"start" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy("start");
    setError(null);
    const result = await apiCall<{ url: string }>("/api/mentors/me/connect/start", { method: "POST" });

    if (result.ok) {
      window.location.assign(result.data.url);
    } else {
      setBusy(null);
      setError(result.error.message);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setError(null);
    const result = await apiCall("/api/mentors/me/connect/refresh", { method: "POST" });
    setBusy(null);

    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error.message);
    }
  }

  return (
    <div className="flex flex-col gap-related">
      <div className="flex flex-wrap gap-related">
        {status === null || status === "action_required" ? (
          <Button disabled={busy !== null} onClick={() => void start()}>
            {busy === "start" ? "Opening Stripe…" : status === null ? "Set up payouts" : "Continue onboarding"}
          </Button>
        ) : null}
        {status === null ? null : (
          <Button appearance="outline" disabled={busy !== null} onClick={() => void refresh()}>
            {busy === "refresh" ? "Checking…" : "Refresh status"}
          </Button>
        )}
      </div>
      {error === null ? null : (
        <p role="alert" className="text-body-small text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
