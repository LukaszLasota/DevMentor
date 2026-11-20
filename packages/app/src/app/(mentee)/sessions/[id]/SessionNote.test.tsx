import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NoteView, NoteVersionView } from "@devmentor/core/http";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { SessionNote } = await import("./SessionNote");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const NOTE = "We set up retries behind a queue and made the handler idempotent.";
const version = (n: number, fields: Partial<NoteVersionView> = {}): NoteVersionView => ({
  version: n,
  body: `${NOTE} v${n}`,
  sentAt: "2026-06-22T17:00:00.000Z",
  decision: null,
  decisionComment: null,
  decidedAt: null,
  ...fields,
});
const view = (fields: Partial<NoteView>): NoteView => ({ role: "mentee", state: "none", versions: [], canSend: false, canDecide: false, prefill: null, ...fields });
const ok = (data: unknown = {}) => new Response(JSON.stringify({ ok: true, data }), { headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("SessionNote", () => {
  it("says the note is private (R03) and that there is none yet", () => {
    render(<SessionNote sessionId={ID} note={view({})} />);

    expect(document.body.textContent).toContain("Only you and your mentor can see it. It is not published anywhere.");
    expect(screen.getByText("No note yet.")).toBeTruthy();
  });

  it("mentor: waits for the end, then writes from the pre-fill and sends", async () => {
    const { unmount } = render(<SessionNote sessionId={ID} note={view({ role: "mentor" })} />);
    expect(screen.getByText("You can write the note when the session has ended.")).toBeTruthy();
    expect(document.body.textContent).toContain("Only you and the mentee can see it.");
    unmount();

    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionNote sessionId={ID} note={view({ role: "mentor", canSend: true, prefill: NOTE })} />);
    expect((screen.getByLabelText(/^Note/) as HTMLTextAreaElement).value).toBe(NOTE);
    await userEvent.click(screen.getByRole("button", { name: "Send to the mentee" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${ID}/note`, expect.objectContaining({ method: "POST", body: JSON.stringify({ body: NOTE }) }));
  });

  it("mentor: waiting, then the decline comment with the form again, the limit, and the history", () => {
    const { unmount } = render(<SessionNote sessionId={ID} note={view({ role: "mentor", state: "waiting", versions: [version(1)] })} />);
    expect(screen.getByText("Waiting for the mentee's decision.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve note" })).toBeNull();
    unmount();

    const declined = [version(1, { decision: "declined", decisionComment: "Add the queue part." })];
    const { unmount: second } = render(<SessionNote sessionId={ID} note={view({ role: "mentor", state: "declined", versions: declined, canSend: true, prefill: `${NOTE} v1` })} />);
    expect(screen.getByText(/The mentee declined the last version: “Add the queue part.”/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send to the mentee" })).toBeTruthy();
    second();

    const full = Array.from({ length: 10 }, (_, i) => version(i + 1, { decision: "declined", decisionComment: "Again please." }));
    render(<SessionNote sessionId={ID} note={view({ role: "mentor", state: "declined", versions: full })} />);
    expect(screen.getByText(/reached its version limit/)).toBeTruthy();
    expect(screen.getByText("Earlier versions")).toBeTruthy();
    expect(screen.getAllByText(/Version \d+ · declined/)).toHaveLength(9);
  });

  it("mentor: an empty form when there is nothing to start from", () => {
    render(<SessionNote sessionId={ID} note={view({ role: "mentor", canSend: true, prefill: null })} />);

    expect((screen.getByLabelText(/^Note/) as HTMLTextAreaElement).value).toBe("");
  });

  it("mentee: approves the waiting version", async () => {
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionNote sessionId={ID} note={view({ state: "waiting", versions: [version(1)], canDecide: true })} />);

    expect(screen.getByText(`${NOTE} v1`)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Approve note" }));

    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${ID}/note/decision`, expect.objectContaining({ body: JSON.stringify({ decision: "approved", version: 1 }) }));
  });

  it("mentee: declines with a required comment, can go back, and sees a refusal", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: { code: "NOTE_NOT_PENDING", message: "This version is not waiting for a decision." } }), { status: 409, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<SessionNote sessionId={ID} note={view({ state: "waiting", versions: [version(1)], canDecide: true })} />);

    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect(screen.getByRole("button", { name: "Decline with this comment" })).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByLabelText("What should change?"), "Add the queue part.");
    await userEvent.click(screen.getByRole("button", { name: "Decline with this comment" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sessions/${ID}/note/decision`,
      expect.objectContaining({ body: JSON.stringify({ decision: "declined", version: 1, comment: "Add the queue part." }) }),
    );
    expect((await screen.findByRole("alert")).textContent).toBe("This version is not waiting for a decision.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("mentee: after declining sees the comment; both see the approved note", () => {
    const { unmount } = render(<SessionNote sessionId={ID} note={view({ state: "declined", versions: [version(1, { decision: "declined", decisionComment: "Add the queue part." })] })} />);
    expect(screen.getByText(/You declined the last version/)).toBeTruthy();
    unmount();

    render(<SessionNote sessionId={ID} note={view({ state: "approved", versions: [version(1, { decision: "approved", decidedAt: "2026-06-22T18:00:00.000Z" })] })} />);
    expect(screen.getByText(/Approved/)).toBeTruthy();
    expect(screen.getByText(`${NOTE} v1`)).toBeTruthy();
  });
});
