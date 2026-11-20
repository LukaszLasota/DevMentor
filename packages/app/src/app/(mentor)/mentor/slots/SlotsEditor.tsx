"use client";

import type { SlotView } from "@devmentor/core/http";
import { slotCreateSchema } from "@devmentor/core/validators";
import { apiCall, CrudForm, ErrorMessage, SlotsPanel } from "@devmentor/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Scope = "upcoming" | "past";

/**
 * Publish, list and remove slots (spec #25, UI/UX): one datetime field in the mentor's own zone, the
 * Storybook `SlotsPanel` table with lead-time state and a confirmed Remove, and a "Show past" toggle.
 * The list is re-read from the API after each change so it always shows what is stored.
 */
export function SlotsEditor({ initial }: { initial: SlotView[] }) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial);
  const [scope, setScope] = useState<Scope>("upcoming");
  const [error, setError] = useState<{ message: string; retry: Scope } | null>(null);
  const [formKey, setFormKey] = useState(0);
  // Only the latest read may update the list: fast toggles can answer out of order.
  const latest = useRef(0);

  async function load(next: Scope) {
    const request = ++latest.current;
    const result = await apiCall<{ items: SlotView[] }>(`/api/availability/slots?scope=${next}`);

    if (request !== latest.current) {
      return;
    }

    if (!result.ok) {
      // Try again re-reads what was asked for, not what is still shown.
      setError({ message: result.error.message, retry: next });
      return;
    }

    setError(null);
    setScope(next);
    setSlots(result.data.items);
  }

  async function remove(id: string) {
    const result = await apiCall(`/api/availability/slots/${id}`, { method: "DELETE" });

    if (!result.ok) {
      setError({ message: result.error.message, retry: scope });
      return;
    }

    await load(scope);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-section">
      <section aria-labelledby="publish-title" className="flex max-w-measure flex-col gap-paragraph">
        <h2 id="publish-title" className="text-heading-4 font-semibold">
          Publish a slot
        </h2>
        <p className="text-body-small text-muted-foreground">
          Mentees can book a slot until two hours before it starts. Each session is 25 or 50 minutes, chosen at booking.
        </p>
        <CrudForm
          key={formKey}
          schema={slotCreateSchema}
          fields={[{ name: "startsAt", label: "Start time", type: "datetime" }]}
          submitLabel="Publish slot"
          submittingLabel="Publishing…"
          onSubmit={(values) => apiCall<SlotView>("/api/availability/slots", { method: "POST", body: values })}
          onSuccess={async () => {
            setFormKey((key) => key + 1);
            await load("upcoming");
            router.refresh();
          }}
        />
      </section>
      {error ? <ErrorMessage message={error.message} onRetry={() => void load(error.retry)} /> : null}
      <SlotsPanel
        slots={slots.map((slot) => ({ ...slot, past: scope === "past" }))}
        showPast={scope === "past"}
        onShowPastChange={(showPast) => void load(showPast ? "past" : "upcoming")}
        onRemove={(id) => void remove(id)}
      />
    </div>
  );
}
