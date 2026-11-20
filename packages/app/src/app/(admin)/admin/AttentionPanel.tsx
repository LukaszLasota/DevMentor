import { formatMoney, withScope } from "@devmentor/core";
import type { AttentionItem } from "@devmentor/core/http";
import { Badge, EmptyState, LocalTime, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@devmentor/ui";
import { RetryRefundButton } from "./RetryRefundButton";

const STATE: Record<string, { label: string; tone: "warning" | "danger" | "neutral" }> = {
  requested: { label: "Refund not confirmed by Stripe", tone: "warning" },
  pending: { label: "Refund pending at Stripe", tone: "neutral" },
  failed: { label: "Refund failed", tone: "danger" },
  orphaned: { label: "Paid, time not kept", tone: "danger" },
};

function stateOf(item: AttentionItem) {
  return STATE[item.status === "payment_orphaned" ? "orphaned" : (item.refundStatus as string)] as (typeof STATE)[string];
}

/**
 * /admin "Needs attention" (spec 2026-11-20-booking-cancellation): refunds not yet succeeded and paid
 * bookings whose time could not be kept. The operator retries a refund here or finishes it by hand in
 * Stripe, checking the booking id in the refund's metadata first (R16). Rendered behind the page's
 * operator guard.
 */
export async function AttentionPanel() {
  const items = await withScope(({ bookingCancellationService }) => bookingCancellationService.needsAttention());

  return (
    <section aria-labelledby="attention-heading" className="flex flex-col gap-related">
      <h2 id="attention-heading" className="text-heading-3 font-semibold">
        Needs attention
      </h2>
      {items.length === 0 ? (
        <EmptyState title="Nothing needs attention." description="Failed refunds and payments without a kept time show up here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead>Mentee</TableHead>
              <TableHead>Mentor</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Stripe</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const state = stateOf(item);

              return (
                <TableRow key={item.bookingId}>
                  <TableCell>
                    <LocalTime iso={item.startsAt} />
                  </TableCell>
                  <TableCell>{item.menteeEmail}</TableCell>
                  <TableCell>{item.mentorName}</TableCell>
                  <TableCell>{formatMoney(item.priceCents, item.currency)}</TableCell>
                  <TableCell>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-body-small">
                    {[item.bookingId, item.checkoutSessionId, item.refundId].filter(Boolean).join(" · ")}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.status === "cancelled" ? <RetryRefundButton bookingId={item.bookingId} /> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
