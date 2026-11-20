import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlotView } from "@devmentor/core/http";
import { SlotsEditor } from "./SlotsEditor";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const TOMORROW: SlotView = { id: "6f1d0c3a-2b4e-4c5d-8e9f-0a1b2c3d4e5f", startsAt: "2026-06-23T09:00:00.000Z", meetsLeadTime: true };
const SOON: SlotView = { id: "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60", startsAt: "2026-06-22T17:00:00.000Z", meetsLeadTime: false };

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  refresh.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const call = (index: number) => fetchMock.mock.calls[index] as [string, RequestInit];
const noRatings = () => expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?)\b/i);

describe("SlotsEditor", () => {
  it("shows the publish form and the upcoming slots with their lead-time state", () => {
    render(<SlotsEditor initial={[SOON, TOMORROW]} />);

    expect(screen.getByLabelText("Start time")).toBeTruthy();
    expect(screen.getByText("Bookable")).toBeTruthy();
    expect(screen.getByText("Less than 2 h away")).toBeTruthy();
    noRatings();
  });

  it("shows the empty state with the next step", () => {
    render(<SlotsEditor initial={[]} />);

    expect(screen.getByText("No upcoming slots.")).toBeTruthy();
    expect(screen.getByText("Publish one so mentees can book you.")).toBeTruthy();
  });

  it("publishes the typed local time as UTC, then re-reads the list and refreshes server views", async () => {
    const user = userEvent.setup();
    render(<SlotsEditor initial={[]} />);
    fetchMock
      .mockResolvedValueOnce(respond(200, { ok: true, data: TOMORROW }))
      .mockResolvedValueOnce(respond(200, { ok: true, data: { items: [TOMORROW] } }));

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "2026-06-23T11:00" } });
    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect(await screen.findByText("Bookable")).toBeTruthy();
    expect(call(0)[0]).toBe("/api/availability/slots");
    expect(JSON.parse(call(0)[1].body as string)).toEqual({ startsAt: new Date("2026-06-23T11:00").toISOString() });
    expect(call(1)[0]).toBe("/api/availability/slots?scope=upcoming");
    expect(refresh).toHaveBeenCalled();
    expect((screen.getByLabelText("Start time") as HTMLInputElement).value).toBe("");
  });

  it("shows a refused publish on the field", async () => {
    const user = userEvent.setup();
    render(<SlotsEditor initial={[]} />);
    fetchMock.mockResolvedValueOnce(
      respond(400, {
        ok: false,
        error: { code: "VALIDATION_ERROR", message: "Pick a start time in the future.", fieldErrors: { startsAt: ["Pick a start time in the future."] } },
      }),
    );

    fireEvent.change(screen.getByLabelText("Start time"), { target: { value: "2026-06-23T11:00" } });
    await user.click(screen.getByRole("button", { name: "Publish slot" }));

    expect((await screen.findAllByText("Pick a start time in the future.")).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Start time").getAttribute("aria-invalid")).toBe("true");
  });

  it("removes a slot after confirmation and re-reads the list", async () => {
    const user = userEvent.setup();
    render(<SlotsEditor initial={[TOMORROW]} />);
    fetchMock
      .mockResolvedValueOnce(respond(200, { ok: true, data: { id: TOMORROW.id } }))
      .mockResolvedValueOnce(respond(200, { ok: true, data: { items: [] } }));

    await user.click(screen.getByRole("button", { name: /^Remove slot/ }));
    await user.click(screen.getByRole("button", { name: "Remove slot" }));

    expect(await screen.findByText("No upcoming slots.")).toBeTruthy();
    expect(call(0)).toEqual([`/api/availability/slots/${TOMORROW.id}`, expect.objectContaining({ method: "DELETE" })]);
    expect(refresh).toHaveBeenCalled();
  });

  it("shows a failed removal with Try again, which re-reads the list", async () => {
    const user = userEvent.setup();
    render(<SlotsEditor initial={[TOMORROW]} />);
    fetchMock
      .mockResolvedValueOnce(respond(404, { ok: false, error: { code: "NOT_FOUND", message: "Slot not found." } }))
      .mockResolvedValueOnce(respond(200, { ok: true, data: { items: [] } }));

    await user.click(screen.getByRole("button", { name: /^Remove slot/ }));
    await user.click(screen.getByRole("button", { name: "Remove slot" }));
    expect(await screen.findByText("Slot not found.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No upcoming slots.")).toBeTruthy();
    expect(screen.queryByText("Slot not found.")).toBeNull();
  });

  it("switches to past slots and back; a failed read keeps the list", async () => {
    const user = userEvent.setup();
    const past = { ...TOMORROW, startsAt: "2026-06-20T09:00:00.000Z", meetsLeadTime: false };
    render(<SlotsEditor initial={[TOMORROW]} />);
    fetchMock
      .mockResolvedValueOnce(respond(200, { ok: true, data: { items: [past] } }))
      .mockResolvedValueOnce(respond(503, { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Try again later." } }));

    await user.click(screen.getByRole("checkbox", { name: "Show past" }));
    const table = await screen.findByRole("table");
    expect(within(table).getByText("Past")).toBeTruthy();
    expect(within(table).queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(call(0)[0]).toBe("/api/availability/slots?scope=past");

    await user.click(screen.getByRole("checkbox", { name: "Show past" }));

    expect(await screen.findByText("Try again later.")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("Past")).toBeTruthy();
  });
});
