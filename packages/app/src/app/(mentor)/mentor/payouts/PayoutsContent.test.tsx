import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getOwn: vi.fn(), requirePageRole: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ connectService: { getOwn: mocks.getOwn } }),
}));
vi.mock("@devmentor/core/http", () => ({
  isAppError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));
vi.mock("./ConnectActions", () => ({ ConnectActions: ({ status }: { status: string | null }) => <p>actions {String(status)}</p> }));

const { PayoutsContent } = await import("./PayoutsContent");

const params = (connect?: string) => ({ searchParams: Promise.resolve(connect === undefined ? {} : { connect }) });

beforeEach(() => {
  mocks.requirePageRole.mockReset().mockResolvedValue({ id: "u-1" });
  mocks.getOwn.mockReset().mockResolvedValue({ onboardingStatus: null, lastReconciledAt: null });
});

describe("/mentor/payouts", () => {
  it("guards the page for mentors and offers setup, saying it is optional", async () => {
    render(await PayoutsContent(params()));

    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor/payouts", "mentor");
    expect(mocks.getOwn).toHaveBeenCalledWith("u-1");
    expect(document.body.textContent).toContain("You can publish times and be booked without it.");
    expect(screen.getByText("actions null")).toBeTruthy();
  });

  it.each([
    ["enabled", "Payouts enabled"],
    ["action_required", "Stripe needs more details"],
    ["pending_verification", "Stripe is verifying your details"],
    ["restricted", "Payouts are restricted"],
  ])("shows the %s state with when it was checked", async (status, title) => {
    mocks.getOwn.mockResolvedValue({ onboardingStatus: status, lastReconciledAt: "2026-06-22T16:00:00.000Z" });

    render(await PayoutsContent(params()));

    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText(/Checked/)).toBeTruthy();
  });

  it("says what happened after Stripe sends the mentor back, or after an expired link", async () => {
    const { unmount } = render(await PayoutsContent(params("return")));
    expect(screen.getByRole("status").textContent).toContain("refresh the status shortly");
    unmount();

    render(await PayoutsContent(params("reauth")));
    expect(screen.getByRole("status").textContent).toContain("The Stripe link expired.");
  });

  it("explains a missing mentor page, and lets other failures through", async () => {
    mocks.getOwn.mockRejectedValueOnce({ status: 404 });
    render(await PayoutsContent(params()));
    expect(screen.getByText("You have no mentor page yet")).toBeTruthy();

    mocks.getOwn.mockRejectedValueOnce(new Error("db down"));
    await expect(PayoutsContent(params())).rejects.toThrow("db down");
  });

  it("omits the check time before the first check", async () => {
    mocks.getOwn.mockResolvedValue({ onboardingStatus: "action_required", lastReconciledAt: null });

    render(await PayoutsContent(params()));

    expect(screen.queryByText(/Checked/)).toBeNull();
  });
});
