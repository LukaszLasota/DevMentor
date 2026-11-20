"use client";

import { useId, useState } from "react";
import { buttonVariants } from "../ui/button-variants";

export type BookingLength = "25" | "50";

export interface SlotBookingControlsProps {
  /** Lengths free at this time (spec #29): a length that would overlap another booking is absent. */
  lengths: readonly BookingLength[];
  /** Preformatted by the page (formatMoney), e.g. "PLN 150.00". */
  prices: Record<BookingLength, string>;
  /** Readable start, for the accessible group name (e.g. "Tue, 23 Jun, 11:00"). */
  timeLabel: string;
  /**
   * Starts the booking; resolves with an error message to show under this time, or `null` once the
   * browser is on its way to payment. Owned by the page: this component calls nothing itself.
   */
  onBook: (length: BookingLength) => Promise<string | null>;
}

/**
 * Length choice with its price and a Book button for one open time on /m/[slug] (spec #29, UI/UX).
 * Tailwind only (public page). Shows the price before paying (AC1); no copy about response times (R09).
 */
export function SlotBookingControls({ lengths, prices, timeLabel, onBook }: SlotBookingControlsProps) {
  const name = useId();
  const [length, setLength] = useState<BookingLength | undefined>(lengths[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (length === undefined) {
    return null;
  }

  async function book(chosen: BookingLength) {
    setBusy(true);
    setError(null);
    const message = await onBook(chosen);

    // On success the page is leaving for Stripe: keep the button busy so it cannot be pressed twice.
    if (message !== null) {
      setError(message);
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-related sm:w-auto sm:items-end">
      <div className="flex flex-wrap items-center gap-related">
        <fieldset className="flex flex-wrap gap-related" aria-label={`Length for ${timeLabel}`}>
          {lengths.map((option) => (
            <label
              key={option}
              className="inline-flex cursor-pointer items-center gap-related rounded-control border border-border px-related py-badge-y text-caption has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:focus-ring"
            >
              <input
                type="radio"
                name={name}
                value={option}
                checked={length === option}
                onChange={() => setLength(option)}
                disabled={busy}
                className="sr-only"
              />
              <span className="text-muted-foreground">{option} min</span>{" "}
              <span className="font-mono font-medium tabular-nums text-foreground">{prices[option]}</span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className={buttonVariants({ intent: "primary", appearance: "filled", size: "sm" })}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) void book(length);
          }}
        >
          {busy ? "Opening payment…" : "Book"}
        </button>
      </div>
      <p role="alert" className="text-caption text-destructive empty:hidden">
        {error}
      </p>
    </div>
  );
}
