import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@devmentor/core/http";
import { SESSION_POLL_MS, SessionChat } from "./SessionChat";

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const message = (seq: number, mine: boolean, body: string) => ({ id: `m-${seq}`, seq, mine, body, createdAt: "2026-06-22T16:01:00.000Z" });
const VIEW: SessionView = {
  id: ID,
  role: "mentee",
  lengthMinutes: 25,
  startsAt: "2026-06-22T16:00:00.000Z",
  endsAt: "2026-06-22T16:25:00.000Z",
  messagesUntil: "2026-06-22T16:55:00.000Z",
  answerUntil: "2026-06-23T16:25:00.000Z",
  phase: "open",
  canSend: true,
  canAnswer: false,
  otherParty: { displayName: "Ada" },
  messages: [message(1, true, "Hi")],
  answer: null,
};
const envelope = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => envelope({ ok: true, data: { ...VIEW, messages: [] } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SESSION_POLL_MS);
  });
}

describe("SessionChat", () => {
  it("shows the conversation with own and the other party's messages, line breaks kept", () => {
    render(<SessionChat initial={{ ...VIEW, messages: [message(1, true, "Hi"), message(2, false, "Hello\nthere")] }} />);

    const items = screen.getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("You");
    expect(items[1]?.textContent).toContain("Ada");
    expect(screen.getByText(/Hello/).textContent).toBe("Hello\nthere");
  });

  it("polls after the last sequence number, appends new messages once and announces the other party's", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock
      .mockResolvedValueOnce(envelope({ ok: true, data: { ...VIEW, messages: [message(2, false, "Hello")] } }))
      .mockResolvedValueOnce(envelope({ ok: true, data: { ...VIEW, messages: [message(2, false, "Hello")] } }));
    render(<SessionChat initial={VIEW} />);

    await tick();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/sessions/${ID}?after=1`, expect.anything());
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("1 new message from Ada.")).toBeTruthy();

    await tick();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/sessions/${ID}?after=2`, expect.anything());
    expect(screen.getAllByText("Hello")).toHaveLength(1);
  });

  it("says Reconnecting… when a poll fails, and recovers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValueOnce(envelope({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Down." } }, 503));
    render(<SessionChat initial={VIEW} />);

    await tick();
    expect(screen.getByRole("status").textContent).toBe("Reconnecting…");

    await tick();
    expect(screen.queryByText("Reconnecting…")).toBeNull();
  });

  it("does not poll while the tab is hidden, and stops once the chat closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<SessionChat initial={VIEW} />);

    await tick();
    expect(fetchMock).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    fetchMock.mockResolvedValueOnce(envelope({ ok: true, data: { ...VIEW, phase: "closed", canSend: false, messages: [] } }));
    await tick();
    expect(screen.getByText("The chat is closed.")).toBeTruthy();

    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockRestore();
  });

  it("sends with the button or Ctrl+Enter, clears the draft, and shows a refusal", async () => {
    fetchMock.mockResolvedValueOnce(envelope({ ok: true, data: message(2, true, "Question") }));
    render(<SessionChat initial={VIEW} />);

    await userEvent.type(screen.getByLabelText("Message"), "Question");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(fetchMock).toHaveBeenCalledWith(`/api/sessions/${ID}/messages`, expect.objectContaining({ method: "POST", body: JSON.stringify({ body: "Question" }) }));
    expect(await screen.findByText("Question")).toBeTruthy();
    expect((screen.getByLabelText("Message") as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByText(/new message/)).toBeNull();

    fetchMock.mockResolvedValueOnce(envelope({ ok: false, error: { code: "SESSION_NOT_OPEN", message: "The chat is not open now." } }, 409));
    await userEvent.type(screen.getByLabelText("Message"), "Late{Control>}{Enter}{/Control}");
    expect((await screen.findByRole("alert")).textContent).toBe("The chat is not open now.");
  });

  it("ignores an empty draft and Enter without a modifier", async () => {
    render(<SessionChat initial={VIEW} />);

    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByLabelText("Message"), "   {Control>}{Enter}{/Control}");
    await userEvent.type(screen.getByLabelText("Message"), "x{Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("before the start says when it opens; with no messages says so", () => {
    render(<SessionChat initial={{ ...VIEW, phase: "not_started", canSend: false, messages: [] }} />);

    expect(screen.getByText(/This session opens at/)).toBeTruthy();
    expect(screen.getByText("No messages yet.")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
  });

  it("announces several new messages in the plural", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValueOnce(envelope({ ok: true, data: { ...VIEW, messages: [message(2, false, "A"), message(3, false, "B")] } }));
    render(<SessionChat initial={{ ...VIEW, messages: [] }} />);

    await tick();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/sessions/${ID}?after=0`, expect.anything());
    expect(screen.getByText("2 new messages from Ada.")).toBeTruthy();
  });
});
