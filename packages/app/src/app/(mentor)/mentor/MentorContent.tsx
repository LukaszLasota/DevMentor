import { formatMoney, withScope } from "@devmentor/core";
import type { MentorOwnerView } from "@devmentor/core/http";
import { LocalTime, ReadinessChecklist, RoleNotice, type ReadinessItem } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";

/**
 * A stored price outside the *current* bounds, named (spec #24, Q4: bounds tightened after a save),
 * e.g. "Your 50-minute price PLN 700.00 is above the allowed PLN 600.00 — save a new price."
 */
function outOfBounds(own: MentorOwnerView): string | undefined {
  const { prices, priceBounds } = own;

  if (prices === null || priceBounds === null) {
    return undefined;
  }

  for (const [length, cents, bounds] of [
    ["25", prices.price25Cents, priceBounds.p25],
    ["50", prices.price50Cents, priceBounds.p50],
  ] as const) {
    const money = (value: number) => formatMoney(value, prices.currency);

    if (cents > bounds.maxCents) {
      return `Your ${length}-minute price ${money(cents)} is above the allowed ${money(bounds.maxCents)} — save a new price.`;
    }

    if (cents < bounds.minCents) {
      return `Your ${length}-minute price ${money(cents)} is below the allowed ${money(bounds.minCents)} — save a new price.`;
    }
  }

  return undefined;
}

const isMet = (own: MentorOwnerView | null, ...keys: string[]) =>
  keys.every((key) => own?.offerReadiness.some((item) => item.key === key && item.met) === true);

// The onboarding steps of s06, each from `mentorOfferReady` where it has a requirement: the page step
// links to /mentor/profile (#23), prices to /mentor/prices (#24: both set and within the current
// bounds), the slot step to /mentor/slots (#25: a slot within two hours does not count).
function steps(own: MentorOwnerView | null): ReadinessItem[] {
  return [
    { key: "published", label: "Publish your page", met: own?.publishedAt != null, href: "/mentor/profile", actionLabel: "Edit your page" },
    {
      key: "prices",
      label: "Set your prices",
      met: isMet(own, "price25", "price50"),
      href: "/mentor/prices",
      actionLabel: "Set prices",
      detail: own === null ? undefined : outOfBounds(own),
    },
    { key: "slot", label: "Publish a slot", met: isMet(own, "hasBookableSlot"), href: "/mentor/slots", actionLabel: "Add a slot" },
  ];
}

/**
 * /mentor body, mentors only (s06): the one thing D13 measures — "Publish at least one bookable
 * session by <date>" (the first accepted invitation's deadline, in the viewer's time zone after
 * hydration) — and the steps towards it. `?notice=` explains a redirect here from another role's page (L03).
 */
export async function MentorContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("/mentor", "mentor");
  const { notice } = await searchParams;
  const own = await withScope(({ mentorProfileService }) => mentorProfileService.findOwn(user.id));
  const publishDueAt = own?.initialPublishDueAt ?? null;

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Your mentor page</h1>
      <RoleNotice notice={notice} />
      <ReadinessChecklist
        className="max-w-measure"
        title={
          publishDueAt === null ? (
            "Publish at least one bookable session"
          ) : (
            <>
              Publish at least one bookable session by <LocalTime iso={publishDueAt} format="date" />
            </>
          )
        }
        items={steps(own)}
      />
    </>
  );
}
