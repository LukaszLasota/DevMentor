"use client";

import { useRouter } from "next/navigation";
import { bookingReportSchema } from "@devmentor/core/validators";
import { apiCall, CrudForm } from "@devmentor/ui";

/**
 * "Report a problem" on /bookings/[id] (spec 2026-11-20-booking-cancellation, phase 2, AC3): the mentee
 * describes what went wrong; the DevMentor team (the operator, R16) reads it and replies by email.
 * Reporting never refunds automatically (R10). Once sent, the page shows when it was reported.
 */
export function ReportProblem({ bookingId }: { bookingId: string }) {
  const router = useRouter();

  return (
    <section aria-labelledby="report-heading" className="flex flex-col gap-related">
      <h2 id="report-heading" className="text-heading-3 font-semibold">
        Report a problem
      </h2>
      <p className="text-body-small text-muted-foreground">
        Something went wrong with this session? Tell the DevMentor team. Reporting does not refund automatically; we reply by email.
      </p>
      <CrudForm
        schema={bookingReportSchema}
        fields={[{ name: "message", label: "What went wrong", type: "textarea", required: true }]}
        submitLabel="Send report"
        submittingLabel="Sending…"
        onSubmit={(values) => apiCall(`/api/bookings/${encodeURIComponent(bookingId)}/report`, { method: "POST", body: values })}
        onSuccess={() => router.refresh()}
      />
    </section>
  );
}
