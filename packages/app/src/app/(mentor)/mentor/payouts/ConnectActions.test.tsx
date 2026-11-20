import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { ConnectActions } = await import("./ConnectActions");

const respond = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  router.refresh.mockReset();
});

describe("ConnectActions", () => {
  it("Set up payouts asks for a link and sends the browser to Stripe", async () => {
    vi.stubGlobal("fetch", respond({ ok: true, data: { url: "https://connect.stripe.test/x" } }));
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<ConnectActions status={null} />);
    expect(screen.queryByRole("button", { name: "Refresh status" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Set up payouts" }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.test/x"));
  });

  it("shows a refused start, and Continue onboarding while Stripe needs details", async () => {
    vi.stubGlobal("fetch", respond({ ok: false, error: { code: "CONNECT_FAILED", message: "Stripe could not set up payouts." } }, 409));

    render(<ConnectActions status="action_required" />);
    await userEvent.click(screen.getByRole("button", { name: "Continue onboarding" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Stripe could not set up payouts.");
    expect(screen.getByRole("button", { name: "Continue onboarding" })).toHaveProperty("disabled", false);
  });

  it("Refresh status re-reads Stripe and the page, or shows the error; no setup once enabled", async () => {
    const fetchMock = respond({ ok: true, data: { onboardingStatus: "enabled" } });
    vi.stubGlobal("fetch", fetchMock);
    const { unmount } = render(<ConnectActions status="pending_verification" />);
    expect(screen.queryByRole("button", { name: /onboarding|Set up/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/mentors/me/connect/refresh", expect.objectContaining({ method: "POST" }));
    unmount();

    vi.stubGlobal("fetch", respond({ ok: false, error: { code: "PAYMENTS_UNAVAILABLE", message: "Try again later." } }, 503));
    render(<ConnectActions status="enabled" />);
    await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Try again later.");
  });
});
