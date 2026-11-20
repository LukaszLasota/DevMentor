import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), requirePageSession: vi.fn(), notFound: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ sessionService: { get: mocks.get } }),
}));
vi.mock("@devmentor/core/http", () => ({
  isAppError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));
vi.mock("@/lib/session", () => ({ requirePageSession: mocks.requirePageSession }));
vi.mock("./SessionChat", () => ({ SessionChat: () => <p>chat</p> }));
vi.mock("./AnswerForm", () => ({ AnswerForm: ({ sessionId }: { sessionId: string }) => <p>answer-form {sessionId}</p> }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { SessionContent, TEXT_ONLY } = await import("./SessionContent");

const ID = "7a2e1d4b-3c5f-4d6e-9f0a-1b2c3d4e5f60";
const VIEW = {
  id: ID,
  role: "mentee",
  lengthMinutes: 25,
  startsAt: "2026-06-22T16:00:00.000Z",
  canAnswer: false,
  otherParty: { displayName: "Ada" },
  answer: null as { body: string; submittedAt: string } | null,
};
const params = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  mocks.requirePageSession.mockReset().mockResolvedValue({ id: "u-1" });
  mocks.get.mockReset().mockResolvedValue(VIEW);
  mocks.notFound.mockReset();
});

describe("/sessions/[id]", () => {
  it("requires a session that returns here, reads only the caller's session and says it is text (R01)", async () => {
    render(await SessionContent(params()));

    expect(mocks.requirePageSession).toHaveBeenCalledWith(`/sessions/${ID}`);
    expect(mocks.get).toHaveBeenCalledWith("u-1", ID);
    expect(screen.getByRole("heading", { name: "25-minute session with Ada" })).toBeTruthy();
    expect(document.body.textContent).toContain(TEXT_ONLY);
    expect(TEXT_ONLY).toBe("Sessions are text — no video call.");
    expect(screen.getByText("chat")).toBeTruthy();
  });

  it("mentee: waits for the answer and links Report a problem", async () => {
    render(await SessionContent(params()));

    expect(screen.getByText("The mentor's written answer will appear here.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report a problem on your booking" }).getAttribute("href")).toBe(`/bookings/${ID}`);
  });

  it("mentor: the answer form while it can be submitted, the window otherwise, and no report link", async () => {
    mocks.get.mockResolvedValue({ ...VIEW, role: "mentor", canAnswer: true });
    const { unmount } = render(await SessionContent(params()));
    expect(screen.getByText(`answer-form ${ID}`)).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
    unmount();

    mocks.get.mockResolvedValue({ ...VIEW, role: "mentor", canAnswer: false });
    render(await SessionContent(params()));
    expect(screen.getByText(/until a day after it ends/)).toBeTruthy();
  });

  it("shows the submitted answer with line breaks to both parties", async () => {
    mocks.get.mockResolvedValue({ ...VIEW, answer: { body: "Step one.\nStep two.", submittedAt: "2026-06-22T17:00:00.000Z" } });
    render(await SessionContent(params()));

    expect(screen.getByText(/Step one/).textContent).toBe("Step one.\nStep two.");
    expect(screen.getByText(/Submitted/)).toBeTruthy();
  });

  it("answers 404 for a malformed id without a query, and for someone else's session (AC4)", async () => {
    await expect(SessionContent(params("nope"))).rejects.toThrow("404");
    expect(mocks.get).not.toHaveBeenCalled();

    mocks.get.mockRejectedValueOnce({ status: 404 });
    await expect(SessionContent(params())).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledTimes(2);
  });

  it("lets any other failure reach the error boundary", async () => {
    mocks.get.mockRejectedValueOnce(new Error("db down"));

    await expect(SessionContent(params())).rejects.toThrow("db down");
  });
});
