import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { CancelBooking } = await import("./CancelBooking");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const envelope = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

async function confirm(refundDue: boolean) {
  render(<CancelBooking bookingId={ID} refundDue={refundDue} freeUntil="2026-06-22T09:00:00.000Z" price="PLN 150.00" />);
  await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));
}

describe("CancelBooking", () => {
  it("free: shows the cut-off and the refund, confirms with the same terms, then re-reads the page", async () => {
    const fetchMock = vi.fn(() => envelope({ ok: true, data: { id: ID, status: "cancelled" } }));
    vi.stubGlobal("fetch", fetchMock);

    await confirm(true);
    expect(document.body.textContent).toContain("Free cancellation until");
    expect(screen.getByRole("alertdialog").textContent).toContain("You will get PLN 150.00 back in full.");
    await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/bookings/${ID}/cancel`, expect.objectContaining({ method: "POST", body: JSON.stringify({ expectRefund: true }) }));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("late: tells the mentee the fee is forfeited before they confirm (AC2)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => envelope({ ok: true, data: {} })));

    await confirm(false);

    expect(document.body.textContent).toContain("Cancelling now forfeits the PLN 150.00 fee (less than 24 hours before the session).");
    expect(screen.getByRole("alertdialog").textContent).toContain("You will not get the PLN 150.00 fee back.");
  });

  it("Keep booking closes the dialog and sends nothing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await confirm(true);
    await userEvent.click(screen.getByRole("button", { name: "Keep booking" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changed terms: shows why and re-reads the page with the new terms", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        envelope({ ok: false, error: { code: "CANCELLATION_TERMS_CHANGED", message: "The cancellation terms changed. Check them and confirm again." } }, 409),
      ),
    );

    await confirm(true);
    await userEvent.click(screen.getByRole("button", { name: "Cancel booking" }));

    expect((await screen.findByRole("alert")).textContent).toBe("The cancellation terms changed. Check them and confirm again.");
    expect(router.refresh).toHaveBeenCalled();
  });
});
