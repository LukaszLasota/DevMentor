import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { ReportProblem } = await import("./ReportProblem");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const envelope = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("ReportProblem", () => {
  it("says reporting does not refund, sends the message and re-reads the page", async () => {
    const fetchMock = vi.fn(() => envelope({ ok: true, data: { reportedAt: "2026-06-24T09:00:00.000Z" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportProblem bookingId={ID} />);
    expect(screen.getByRole("heading", { name: "Report a problem" })).toBeTruthy();
    expect(document.body.textContent).toContain("Reporting does not refund automatically");
    await userEvent.type(screen.getByLabelText(/What went wrong/), "The mentor did not show up for the session.");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/bookings/${ID}/report`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ message: "The mentor did not show up for the session." }) }),
    );
  });

  it("checks the length before sending", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ReportProblem bookingId={ID} />);
    await userEvent.type(screen.getByLabelText(/What went wrong/), "Too short");
    await userEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText("Describe the problem in 20 to 2000 characters.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
