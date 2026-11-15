import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));

const { InvitationActions } = await import("./InvitationActions");

const TOKEN = "AbC_123-xyz";
const MATCH = { kind: "match", email: "ada@devmentor.test", tags: ["typescript"], accountEmail: "ada@devmentor.test" } as const;

function stubFetch(...replies: ({ status: number; body: unknown } | Error)[]) {
  const fetchMock = vi.fn(async () => {
    const reply = replies.shift();

    if (reply instanceof Error || reply === undefined) {
      throw reply ?? new Error("no reply");
    }

    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const accepted = { status: 200, body: { ok: true, data: { roles: ["mentee", "mentor"], publishDueAt: "2026-11-28T12:00:00.000Z", redirect: "/mentor" } } };

afterEach(() => {
  vi.unstubAllGlobals();
  mocks.replace.mockReset();
  mocks.refresh.mockReset();
});

describe("InvitationActions", () => {
  it("accepts with a CSRF POST to the accept route and goes to /mentor, staying busy", async () => {
    const fetchMock = stubFetch(accepted);
    render(<InvitationActions token={TOKEN} state={MATCH} />);

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(`/api/invitations/${TOKEN}/accept`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-devmentor-request")).toBe("1");
    expect(mocks.replace).toHaveBeenCalledWith("/mentor");
    expect(screen.getByRole("button", { name: "Accepting…" }).hasAttribute("disabled")).toBe(true);
  });

  it("shows a network error under the button; Try again accepts (L07)", async () => {
    stubFetch(new TypeError("Failed to fetch"), accepted);
    render(<InvitationActions token={TOKEN} state={MATCH} />);

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Network error. Check your connection and try again. Nothing changed.",
    );
    expect(mocks.replace).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(mocks.replace).toHaveBeenCalledWith("/mentor");
  });

  it("shows the server's message for a refused accept (403) and keeps the panel", async () => {
    stubFetch({ status: 403, body: { ok: false, error: { code: "FORBIDDEN", message: "This invitation is for a different email address." } } });
    render(<InvitationActions token={TOKEN} state={MATCH} />);

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect((await screen.findByRole("alert")).textContent).toBe("This invitation is for a different email address. Nothing changed.");
    expect(screen.getByRole("button", { name: "Accept invitation" })).toBeTruthy();
  });

  it("a tab that lost the race (409 ALREADY_MENTOR) says you are already a mentor (L07)", async () => {
    stubFetch({ status: 409, body: { ok: false, error: { code: "ALREADY_MENTOR", message: "You are already a mentor." } } });
    render(<InvitationActions token={TOKEN} state={MATCH} />);

    await userEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    expect(await screen.findByRole("heading", { name: "You are already a mentor." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to your mentor page" }).getAttribute("href")).toBe("/mentor");
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  it("another account: no Accept; Sign out ends the session and re-renders this page", async () => {
    const fetchMock = stubFetch({ status: 200, body: { ok: true, data: null } });
    render(
      <InvitationActions token={TOKEN} state={{ kind: "mismatch", email: "ada@devmentor.test", accountEmail: "bob@devmentor.test" }} />,
    );

    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/auth/sign-out");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
