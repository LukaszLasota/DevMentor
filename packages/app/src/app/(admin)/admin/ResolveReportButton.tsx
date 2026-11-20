"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiCall, Button } from "@devmentor/ui";

/** Marks a dispute report settled (operator, R16); its booking's payout can then be released. */
export function ResolveReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setBusy(true);
    const result = await apiCall(`/api/admin/reports/${encodeURIComponent(reportId)}/resolve`, { method: "POST" });
    setBusy(false);

    if (result.ok) {
      router.refresh();
    } else {
      setError(result.error.message);
    }
  }

  return (
    <span className="flex items-center gap-related">
      <Button size="sm" appearance="outline" disabled={busy} onClick={() => void resolve()}>
        Mark resolved
      </Button>
      {error === null ? null : (
        <span role="alert" className="text-body-small text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
