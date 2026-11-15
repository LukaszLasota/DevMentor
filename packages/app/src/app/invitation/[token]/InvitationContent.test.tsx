import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPageSession: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ invitationService: { find: mocks.find } }),
}));
vi.mock("./InvitationActions", () => ({
  InvitationActions: ({ token, state }: { token: string; state: unknown }) => (
    <pre data-testid="actions">{JSON.stringify({ token, state })}</pre>
  ),
}));

const { InvitationContent, invitationState } = await import("./InvitationContent");

const TOKEN = "AbC_123-xyz";
const INVITATION = { email: "ada@devmentor.test", stackTags: ["typescript", "react"] };

function viewer(overrides: Record<string, unknown> = {}) {
  return { id: "u1", email: "ada@devmentor.test", roles: ["mentee"], emailVerified: true, ...overrides };
}

beforeEach(() => {
  mocks.getPageSession.mockReset().mockResolvedValue(null);
  mocks.find.mockReset().mockResolvedValue(INVITATION);
});

describe("invitationState", () => {
  it("signed out: the invited address and tags, GitHub and email sign-in returning here (L11)", async () => {
    await expect(invitationState(TOKEN)).resolves.toEqual({
      kind: "signed-out",
      email: "ada@devmentor.test",
      tags: ["typescript", "react"],
      githubHref: `/api/auth/github?returnTo=%2Finvitation%2F${TOKEN}`,
      emailHref: `/sign-in?returnTo=%2Finvitation%2F${TOKEN}`,
    });
    expect(mocks.find).toHaveBeenCalledWith(TOKEN);
  });

  it("signed in with the invited, verified email (any case): match", async () => {
    mocks.getPageSession.mockResolvedValue(viewer({ email: "Ada@DevMentor.test" }));

    await expect(invitationState(TOKEN)).resolves.toEqual({
      kind: "match",
      email: "ada@devmentor.test",
      tags: ["typescript", "react"],
      accountEmail: "Ada@DevMentor.test",
    });
  });

  it.each([
    ["another email", viewer({ email: "bob@devmentor.test" }), "bob@devmentor.test"],
    ["the invited email, unverified", viewer({ emailVerified: false }), "ada@devmentor.test"],
  ])("signed in with %s: mismatch, no Accept", async (_case, session, accountEmail) => {
    mocks.getPageSession.mockResolvedValue(session);

    await expect(invitationState(TOKEN)).resolves.toEqual({ kind: "mismatch", email: "ada@devmentor.test", accountEmail });
  });

  it("an invalid token: one state for every cause", async () => {
    mocks.find.mockResolvedValue(null);
    mocks.getPageSession.mockResolvedValue(viewer());

    await expect(invitationState(TOKEN)).resolves.toEqual({ kind: "invalid" });
  });

  it("a viewer who already holds mentor: already a mentor, without looking the token up (L07)", async () => {
    mocks.getPageSession.mockResolvedValue(viewer({ roles: ["mentee", "mentor"] }));

    await expect(invitationState(TOKEN)).resolves.toEqual({ kind: "already-mentor", mentorHref: "/mentor" });
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

describe("InvitationContent", () => {
  it("passes the route token and its state to the client actions", async () => {
    render(await InvitationContent({ params: Promise.resolve({ token: TOKEN }) }));

    expect(JSON.parse(screen.getByTestId("actions").textContent ?? "")).toMatchObject({ token: TOKEN, state: { kind: "signed-out" } });
  });
});
