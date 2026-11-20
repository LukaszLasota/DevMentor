"use client";

import { useRouter } from "next/navigation";
import { sessionAnswerSchema } from "@devmentor/core/validators";
import { apiCall, CrudForm } from "@devmentor/ui";

/** The mentor's one written answer (spec 2026-11-20-text-session, AC3); the page re-reads itself after. */
export function AnswerForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  return (
    <CrudForm
      schema={sessionAnswerSchema}
      fields={[
        {
          name: "body",
          label: "Your written answer",
          type: "textarea",
          required: true,
          description: "Sent once; the mentee is emailed that it is ready.",
        },
      ]}
      submitLabel="Submit answer"
      submittingLabel="Submitting…"
      onSubmit={(values) => apiCall(`/api/sessions/${encodeURIComponent(sessionId)}/answer`, { method: "POST", body: values })}
      onSuccess={() => router.refresh()}
    />
  );
}
