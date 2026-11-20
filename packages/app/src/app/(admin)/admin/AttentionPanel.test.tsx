import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ needsAttention: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ bookingCancellationService: { needsAttention: mocks.needsAttention } }),
}));
vi.mock("./RetryRefundButton", () => ({ RetryRefundButton: ({ bookingId }: { bookingId: string }) => <button>retry {bookingId}</button> }));

const { AttentionPanel } = await import("./AttentionPanel");

const item = (fields: object) => ({
  bookingId: "b-1",
  status: "cancelled",
  refundStatus: "failed",
  refundId: null,
  checkoutSessionId: "cs_1",
  priceCents: 15000,
  currency: "PLN",
  startsAt: "2026-06-23T09:00:00.000Z",
  cancelledAt: "2026-06-21T09:00:00.000Z",
  menteeEmail: "mentee@devmentor.test",
  mentorName: "Ada",
  ...fields,
});

beforeEach(() => {
  mocks.needsAttention.mockReset();
});

describe("AttentionPanel", () => {
  it("lists refunds to see through with Retry, and orphaned payments without it", async () => {
    mocks.needsAttention.mockResolvedValue([
      item({}),
      item({ bookingId: "b-2", refundStatus: "requested" }),
      item({ bookingId: "b-3", refundStatus: "pending", refundId: "re_3" }),
      item({ bookingId: "b-4", status: "payment_orphaned", refundStatus: null, checkoutSessionId: null }),
    ]);

    render(await AttentionPanel());

    expect(screen.getByRole("heading", { name: "Needs attention" })).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[4]?.textContent)).toEqual([
      "Refund failed",
      "Refund not confirmed by Stripe",
      "Refund pending at Stripe",
      "Paid, time not kept",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("mentee@devmentor.test")).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText("PLN 150.00")).toBeTruthy();
    expect(within(rows[2] as HTMLElement).getByText("b-3 · cs_1 · re_3")).toBeTruthy();
    expect(within(rows[3] as HTMLElement).getByText("b-4")).toBeTruthy();
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["retry b-1", "retry b-2", "retry b-3"]);
  });

  it("says when nothing needs attention", async () => {
    mocks.needsAttention.mockResolvedValue([]);

    render(await AttentionPanel());

    expect(screen.getByText("Nothing needs attention.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
