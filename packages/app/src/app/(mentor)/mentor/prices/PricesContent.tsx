import { formatMoney, toMajorString, withScope } from "@devmentor/core";
import { EmptyState } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { PricesForm } from "./PricesForm";

/**
 * /mentor/prices body, mentors only: the owner DTO is read server-side, and the bounds and stored
 * prices are formatted here (`ui` and client code never import core's money module). Settings
 * missing → the fail-closed state and no form (spec: "Prices cannot be set right now").
 */
export async function PricesContent() {
  const user = await requirePageRole("/mentor/prices", "mentor");
  const { own, settings } = await withScope(async ({ mentorProfileService, platformSettingsService }) => ({
    own: await mentorProfileService.findOwn(user.id),
    settings: platformSettingsService.tryGet(),
  }));

  if (own === null) {
    return (
      <>
        <h1 className="text-heading-1 font-semibold">Prices</h1>
        <EmptyState
          title="You have no mentor page yet"
          description="A page is created when you accept a mentor invitation. Ask the operator for one."
        />
      </>
    );
  }

  if (settings === null) {
    return (
      <>
        <h1 className="text-heading-1 font-semibold">Prices</h1>
        <EmptyState title="Prices cannot be set right now" description="The allowed price range is not configured yet." />
      </>
    );
  }

  const { currency, bounds } = settings;
  const range = (length: "25" | "50") =>
    `Allowed: ${formatMoney(bounds[length].minCents, currency)}–${formatMoney(bounds[length].maxCents, currency)}`;

  return (
    <PricesForm
      currency={currency}
      ranges={{ price25: range("25"), price50: range("50") }}
      initial={{
        price25: own.prices ? toMajorString(own.prices.price25Cents) : "",
        price50: own.prices ? toMajorString(own.prices.price50Cents) : "",
      }}
    />
  );
}
