import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { ReleasePayoutsButton } = await import("./ReleasePayoutsButton");
const { ResolveReportButton } = await import("./ResolveReportButton");

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("ReleasePayoutsButton", () => {
  it("runs a release, reports it, and says when more is due", async () => {
    const fetchMock = respond({ ok: true, data: { transferred: 2, held: 1, failed: 0, inFlight: 0, remaining: 3 } });
    vi.stubGlobal("fetch", fetchMock);

    render(<ReleasePayoutsButton />);
    await userEvent.click(screen.getByRole("button", { name: "Release payouts" }));

    expect((await screen.findByRole("status")).textContent).toBe("Transferred 2, held 1, failed 0, in progress 0. 3 more due — release again.");
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/payouts/release", expect.objectContaining({ method: "POST" }));
    expect(router.refresh).toHaveBeenCalled();
  });

  it("reports a run with nothing more due, and an error", async () => {
    vi.stubGlobal("fetch", respond({ ok: true, data: { transferred: 0, held: 0, failed: 0, inFlight: 1, remaining: 0 } }));
    const { unmount } = render(<ReleasePayoutsButton />);
    await userEvent.click(screen.getByRole("button", { name: "Release payouts" }));
    expect((await screen.findByRole("status")).textContent).toBe("Transferred 0, held 0, failed 0, in progress 1.");
    unmount();

    vi.stubGlobal("fetch", respond({ ok: false, error: { code: "FORBIDDEN", message: "Operators only." } }, 403));
    render(<ReleasePayoutsButton />);
    await userEvent.click(screen.getByRole("button", { name: "Release payouts" }));
    expect((await screen.findByRole("status")).textContent).toBe("Operators only.");
  });
});

describe("ResolveReportButton", () => {
  it("marks the report resolved and re-reads, or shows the error", async () => {
    const fetchMock = respond({ ok: true, data: { resolvedAt: "x" } });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ResolveReportButton reportId="r 1" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/reports/r%201/resolve", expect.objectContaining({ method: "POST" }));
    unmount();

    vi.stubGlobal("fetch", respond({ ok: false, error: { code: "NOT_FOUND", message: "Report not found." } }, 404));
    render(<ResolveReportButton reportId="r-2" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark resolved" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Report not found.");
  });
});
