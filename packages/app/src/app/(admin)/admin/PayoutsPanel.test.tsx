import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ payoutService: { list: mocks.list } }),
}));
vi.mock("./ReleasePayoutsButton", () => ({ ReleasePayoutsButton: () => <button>release</button> }));

const { PayoutsPanel } = await import("./PayoutsPanel");

const item = (fields: object) => ({
  bookingId: "b-1",
  status: "held",
  holdReason: "connect_not_enabled",
  failureCode: null,
  netCents: 12000,
  feeCents: 3000,
  currency: "PLN",
  startsAt: "2026-06-23T09:00:00.000Z",
  mentorName: "Ada",
  updatedAt: "2026-06-25T09:00:00.000Z",
  ...fields,
});

beforeEach(() => {
  mocks.list.mockReset();
});

describe("PayoutsPanel", () => {
  it("offers Release and lists each payout not transferred with why", async () => {
    mocks.list.mockResolvedValue([
      item({}),
      item({ bookingId: "b-2", holdReason: "disputed" }),
      item({ bookingId: "b-3", holdReason: "charge_reversed" }),
      item({ bookingId: "b-4", status: "failed", holdReason: null, failureCode: "transfers_not_allowed" }),
      item({ bookingId: "b-5", status: "failed", holdReason: null }),
      item({ bookingId: "b-6", status: "transferring", holdReason: null }),
    ]);

    render(await PayoutsPanel());

    expect(screen.getByRole("heading", { name: "Payouts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "release" })).toBeTruthy();
    expect(screen.getAllByText("PLN 120.00 (fee PLN 30.00)")).toHaveLength(6);
    for (const label of [
      "Held: Stripe payouts not enabled",
      "Held: reported booking",
      "Held: charge refunded or disputed",
      "Failed: transfers_not_allowed",
      "Failed: unknown",
      "Transfer in progress",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("says when nothing waits", async () => {
    mocks.list.mockResolvedValue([]);

    render(await PayoutsPanel());

    expect(screen.getByText("No payouts waiting.")).toBeTruthy();
  });
});
