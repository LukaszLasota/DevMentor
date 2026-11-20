import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutCancelled } from "./CheckoutCancelled";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const refresh = router.refresh;
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  refresh.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CheckoutCancelled", () => {
  it("releases the mentee's own hold, then says the time is open again and re-reads the page", async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true, data: { id: "b-1", status: "expired" } }));

    render(<CheckoutCancelled bookingId="b-1" />);

    expect(screen.getByRole("status").textContent).toBe("Payment cancelled. Nothing was charged.");
    await vi.waitFor(() => expect(screen.getByRole("status").textContent).toBe("Payment cancelled. Nothing was charged. The time is open again."));
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/bookings/b-1/release");
    expect(init.method).toBe("POST");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the short notice when the release fails", async () => {
    fetchMock.mockResolvedValue(respond(404, { ok: false, error: { code: "NOT_FOUND", message: "Booking not found." } }));

    render(<CheckoutCancelled bookingId="b-1" />);

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.getByRole("status").textContent).toBe("Payment cancelled. Nothing was charged.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("calls nothing without a booking id", () => {
    render(<CheckoutCancelled bookingId={null} />);

    expect(screen.getByRole("status").textContent).toBe("Payment cancelled. Nothing was charged. The time is open again.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
