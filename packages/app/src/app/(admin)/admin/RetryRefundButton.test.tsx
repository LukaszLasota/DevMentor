import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { RetryRefundButton } = await import("./RetryRefundButton");

const envelope = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("RetryRefundButton", () => {
  it("posts the retry, says where the refund is and re-reads the list", async () => {
    const fetchMock = vi.fn(() => envelope({ ok: true, data: { refundStatus: "succeeded" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RetryRefundButton bookingId="b 1" />);
    await userEvent.click(screen.getByRole("button", { name: "Retry refund" }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Refund succeeded.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/bookings/b%201/refund", expect.objectContaining({ method: "POST" }));
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry refund" })).toHaveProperty("disabled", false);
  });

  it("shows the error message and disables the button while it runs", async () => {
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));

    render(<RetryRefundButton bookingId="b-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Retry refund" }));
    expect(screen.getByRole("button", { name: "Retrying…" })).toHaveProperty("disabled", true);

    resolve(new Response(JSON.stringify({ ok: false, error: { code: "REFUND_NOT_DUE", message: "This booking has no refund to retry." } }), { status: 409 }));

    expect(await screen.findByText("This booking has no refund to retry.")).toBeTruthy();
  });
});
