"use client";

import { mentorPricesUpdateSchema } from "@devmentor/core/validators";
import { Alert, AlertDescription, apiCall, CrudForm } from "@devmentor/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface PricesFormProps {
  /** The platform currency, printed next to each field (never selectable). */
  currency: string;
  /** "Allowed: PLN 50.00–PLN 300.00" per field, formatted on the server. */
  ranges: { price25: string; price50: string };
  /** Stored prices as major-unit strings ("150.00"), or "" when not set. */
  initial: { price25: string; price50: string };
}

/**
 * Both prices saved together (spec #24, UI/UX): decimal keyboard, the currency as a suffix, the
 * allowed range as help text; a refusal names the range under each offending field and saves nothing.
 */
export function PricesForm({ currency, ranges, initial }: PricesFormProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Prices</h1>
      <div className="flex max-w-measure flex-col gap-paragraph">
        <p className="text-body-small text-muted-foreground">
          Mentees choose 25 or 50 minutes when they book. Set a price for each; both are saved together.
        </p>
        {saved ? (
          <Alert tone="success">
            <AlertDescription>Prices saved.</AlertDescription>
          </Alert>
        ) : null}
        <CrudForm
          schema={mentorPricesUpdateSchema}
          fields={[
            { name: "price25", label: "25 minutes", inputMode: "decimal", suffix: currency, description: ranges.price25 },
            { name: "price50", label: "50 minutes", inputMode: "decimal", suffix: currency, description: ranges.price50 },
          ]}
          defaultValues={initial}
          submitLabel="Save prices"
          submittingLabel="Saving…"
          onSubmit={(values) => {
            setSaved(false);
            return apiCall("/api/mentors/me/prices", { method: "PUT", body: values });
          }}
          onSuccess={() => {
            setSaved(true);
            router.refresh();
          }}
        />
      </div>
    </>
  );
}
