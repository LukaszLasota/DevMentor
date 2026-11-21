import { formatMoney, withScope } from "@devmentor/core";
import type { PayoutItem } from "@devmentor/core/http";
import { Badge, EmptyState, LocalTime, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devmentor/ui";
import { ReleasePayoutsButton } from "./ReleasePayoutsButton";

const REASON: Record<string, string> = {
  connect_not_enabled: "Held: Stripe payouts not enabled",
  disputed: "Held: reported booking",
  charge_reversed: "Held: charge refunded or disputed",
};

function stateOf(item: PayoutItem): { label: string; tone: "warning" | "danger" | "neutral" } {
  if (item.status === "held") return { label: REASON[item.holdReason as string] as string, tone: "warning" };
  if (item.status === "failed") return { label: `Failed: ${item.failureCode ?? "unknown"}`, tone: "danger" };
  return { label: "Transfer in progress", tone: "neutral" };
}

/**
 * /admin "Payouts" (spec 2026-11-21-mentor-payouts, #35): **Release payouts** settles finished sessions
 * (at most 25 a run); the table lists payouts not yet transferred with why. Operators only (the page guard).
 */
export async function PayoutsPanel() {
  const payouts = await withScope(({ payoutService }) => payoutService.list());

  return (
    <section aria-labelledby="payouts-heading" className="flex flex-col gap-related">
      <h2 id="payouts-heading" className="text-heading-3 font-semibold">
        Payouts
      </h2>
      <ReleasePayoutsButton />
      {payouts.length === 0 ? (
        <EmptyState title="No payouts waiting." description="Held, failed and in-progress payouts show up here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Mentor&apos;s share</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Booking</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payouts.map((payout) => {
              const state = stateOf(payout);

              return (
                <TableRow key={payout.bookingId}>
                  <TableCell>
                    <LocalTime iso={payout.startsAt} />
                  </TableCell>
                  <TableCell>{payout.mentorName}</TableCell>
                  <TableCell>
                    {formatMoney(payout.netCents, payout.currency)} (fee {formatMoney(payout.feeCents, payout.currency)})
                  </TableCell>
                  <TableCell>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-body-small">{payout.bookingId}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
