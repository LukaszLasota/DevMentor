import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getOwn: vi.fn(), requirePageSession: vi.fn(), notFound: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ bookingService: { getOwn: mocks.getOwn } }),
}));
vi.mock("@devmentor/core/http", () => ({
  isAppError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/session", () => ({ requirePageSession: mocks.requirePageSession }));
vi.mock("./BookingPending", () => ({ BookingPending: () => <p>pending-poller</p> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { BookingContent } = await import("./BookingContent");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const VIEW = {
  id: ID,
  status: "confirmed",
  lengthMinutes: 25,
  priceCents: 15000,
  currency: "PLN",
  startsAt: "2026-06-23T09:00:00.000Z",
  mentor: { displayName: "Ada", slug: "ada" as string | null },
};
const params = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.requirePageSession.mockReset().mockResolvedValue({ id: "u-1" });
  mocks.getOwn.mockReset().mockResolvedValue(VIEW);
  mocks.notFound.mockReset();
});

describe("/bookings/[id]", () => {
  it("requires a session that returns here, and reads only the caller's own booking", async () => {
    render(await BookingContent(params()));

    expect(mocks.requirePageSession).toHaveBeenCalledWith(`/bookings/${ID}`);
    expect(mocks.getOwn).toHaveBeenCalledWith("u-1", ID);
  });

  it("confirmed: Booked, the length, mentor, time and price — no response-time promise", async () => {
    render(await BookingContent(params()));

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Booked");
    expect(status.textContent).toContain("25-minute text session with Ada on");
    expect(status.textContent).toContain("You paid PLN 150.00. The mentor has been told by email.");
    expect(document.body.textContent).not.toMatch(/respond|reply within|guarantee/i);
  });

  it("pending: the self-refreshing waiting state", async () => {
    mocks.getOwn.mockResolvedValue({ ...VIEW, status: "pending_payment" });
    render(await BookingContent(params()));

    expect(screen.getByText("pending-poller")).toBeTruthy();
  });

  it.each(["expired", "failed"])("%s: not completed, not charged, with a link back to the mentor", async (status) => {
    mocks.getOwn.mockResolvedValue({ ...VIEW, status });
    render(await BookingContent(params()));

    expect(screen.getByText("This booking was not completed")).toBeTruthy();
    expect(screen.getByText("You were not charged. The time may still be open.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Ada" }).getAttribute("href")).toBe("/m/ada");
  });

  it("leaves the link out when the mentor has no page link", async () => {
    mocks.getOwn.mockResolvedValue({ ...VIEW, status: "expired", mentor: { displayName: "Ada", slug: null } });
    render(await BookingContent(params()));

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("payment_orphaned: tells the mentee the operator will follow up", async () => {
    mocks.getOwn.mockResolvedValue({ ...VIEW, status: "payment_orphaned" });
    render(await BookingContent(params()));

    expect(screen.getByText("We received your payment but could not keep the time")).toBeTruthy();
  });

  it("answers 404 for a malformed id without a query, and for someone else's booking", async () => {
    await expect(BookingContent(params("nope"))).rejects.toThrow("404");
    expect(mocks.getOwn).not.toHaveBeenCalled();

    mocks.getOwn.mockRejectedValueOnce({ status: 404 });
    await expect(BookingContent(params())).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledTimes(2);
  });

  it("lets any other failure reach the error boundary", async () => {
    mocks.getOwn.mockRejectedValueOnce(new Error("db down"));

    await expect(BookingContent(params())).rejects.toThrow("db down");
  });
});
