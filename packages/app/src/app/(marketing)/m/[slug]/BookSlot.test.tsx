import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookSlot } from "./BookSlot";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
const refresh = router.refresh;
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SLOT_ID = "6f1d0c3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f";
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  assign = vi.fn();
  vi.stubGlobal("location", { ...window.location, assign });
  refresh.mockReset();
  router.push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSlot() {
  render(
    <BookSlot
      slug="ada"
      slotId={SLOT_ID}
      startsAt="2026-06-23T09:00:00.000Z"
      lengths={["25", "50"]}
      prices={{ "25": "PLN 150.00", "50": "PLN 300.00" }}
    />,
  );
}

describe("BookSlot", () => {
  it("names the time in UTC (same on server and client) and posts the chosen length", async () => {
    fetchMock.mockResolvedValue(respond(200, { ok: true, data: { bookingId: "b-1", checkoutUrl: "https://checkout.test/cs_1" } }));
    renderSlot();

    expect(screen.getByRole("group").getAttribute("aria-label")).toMatch(/^Length for .*UTC$/);
    fireEvent.click(screen.getByRole("radio", { name: "50 min PLN 300.00" }));
    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.test/cs_1"));
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/bookings");
    expect(JSON.parse(init.body as string)).toEqual({ slotId: SLOT_ID, length: "50" });
  });

  it("sends a signed-out visitor to sign-in, back to this page", async () => {
    fetchMock.mockResolvedValue(respond(401, { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }));
    renderSlot();

    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/sign-in?returnTo=%2Fm%2Fada"));
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });

  it.each(["SLOT_TAKEN", "NOT_BOOKABLE", "NOT_FOUND"])("shows the %s message and re-reads the open times", async (code) => {
    fetchMock.mockResolvedValue(respond(409, { ok: false, error: { code, message: "This time was just taken. Pick another one." } }));
    renderSlot();

    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    expect((await screen.findByRole("alert")).textContent).toBe("This time was just taken. Pick another one.");
    expect(refresh).toHaveBeenCalledOnce();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows other refusals (payments unavailable, own time) without re-reading", async () => {
    fetchMock.mockResolvedValue(
      respond(503, { ok: false, error: { code: "PAYMENTS_UNAVAILABLE", message: "Payments are unavailable right now." } }),
    );
    renderSlot();

    fireEvent.click(screen.getByRole("button", { name: "Book" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Payments are unavailable right now.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
