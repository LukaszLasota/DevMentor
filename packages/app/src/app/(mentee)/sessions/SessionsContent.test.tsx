import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listMine: vi.fn(), requirePageSession: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ sessionService: { listMine: mocks.listMine } }),
}));
vi.mock("@/lib/session", () => ({ requirePageSession: mocks.requirePageSession }));
vi.mock("./[id]/SessionContent", () => ({ TEXT_ONLY: "Sessions are text — no video call." }));

const { SessionsContent } = await import("./SessionsContent");

const item = (id: string, state: string, role = "mentee") => ({
  id,
  role,
  state,
  otherParty: { displayName: `Other ${id}` },
  lengthMinutes: 25,
  startsAt: "2026-06-22T16:00:00.000Z",
  endsAt: "2026-06-22T16:25:00.000Z",
});

beforeEach(() => {
  mocks.requirePageSession.mockReset().mockResolvedValue({ id: "u-1" });
  mocks.listMine.mockReset();
});

describe("/sessions", () => {
  it("lists upcoming and past sessions of both roles with their state and a link (R01 line on the page)", async () => {
    mocks.listMine.mockResolvedValue([item("a", "upcoming"), item("b", "open", "mentor"), item("c", "awaiting_answer"), item("d", "answered", "mentor")]);

    render(await SessionsContent());

    expect(mocks.requirePageSession).toHaveBeenCalledWith("/sessions");
    expect(mocks.listMine).toHaveBeenCalledWith("u-1");
    expect(document.body.textContent).toContain("Sessions are text — no video call.");
    const [upcoming, past] = screen.getAllByRole("table");
    expect(within(upcoming as HTMLElement).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Other a"),
      expect.stringContaining("Other b"),
    ]);
    expect(within(upcoming as HTMLElement).getByText("Open now")).toBeTruthy();
    expect(within(upcoming as HTMLElement).getByText("Mentor")).toBeTruthy();
    expect(within(past as HTMLElement).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Answer received"),
      expect.stringContaining("Waiting for the answer"),
    ]);
    expect(screen.getAllByRole("link", { name: "Open session" })[0]?.getAttribute("href")).toBe("/sessions/a");
  });

  it("says when there are no sessions, and when one list is empty", async () => {
    mocks.listMine.mockResolvedValue([]);
    const { unmount } = render(await SessionsContent());
    expect(screen.getByText("No sessions yet.")).toBeTruthy();
    unmount();

    mocks.listMine.mockResolvedValue([item("a", "upcoming")]);
    const { unmount: second } = render(await SessionsContent());
    expect(screen.getByText("No past sessions.")).toBeTruthy();
    second();

    mocks.listMine.mockResolvedValue([item("c", "answered")]);
    render(await SessionsContent());
    expect(screen.getByText("Nothing upcoming.")).toBeTruthy();
  });
});
