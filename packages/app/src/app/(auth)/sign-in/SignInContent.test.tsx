import type { SessionUser } from "@devmentor/core";
import { SIGN_IN_ERRORS } from "@devmentor/ui";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPageSession: vi.fn() }));

vi.mock("@/lib/session", () => ({ getPageSession: mocks.getPageSession, SESSION_ENDED_REASON: "session_ended" }));
vi.mock("@devmentor/core", () => ({
  homeFor: (roles: string[]) => (roles.includes("operator") ? "/admin" : "/mentors"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

const { SignInContent } = await import("./SignInContent");

type Query = Record<string, string | string[] | undefined>;

async function renderSignIn(query: Query) {
  render(await SignInContent({ searchParams: Promise.resolve(query) }));
}

function user(roles: SessionUser["roles"]): SessionUser {
  return { id: "u1", email: "octo@devmentor.test", roles, githubLogin: null, avatarUrl: null, emailVerified: true };
}

function githubHref() {
  return screen.getByRole("link", { name: "Continue with GitHub" }).getAttribute("href");
}

beforeEach(() => {
  mocks.getPageSession.mockReset().mockResolvedValue(null);
});

describe("SignInContent (signed out)", () => {
  it("offers GitHub only, with the forgotten-password line and no message", async () => {
    await renderSignIn({});

    expect(screen.getByRole("heading", { level: 1, name: "Sign in to DevMentor" })).toBeTruthy();
    expect(githubHref()).toBe("/api/auth/github");
    expect(screen.getByText("Forgot your password? Use GitHub with the same email.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("forwards a safe returnTo to the GitHub start route", async () => {
    await renderSignIn({ returnTo: "/mentor/profile?tab=bio" });

    expect(githubHref()).toBe("/api/auth/github?returnTo=%2Fmentor%2Fprofile%3Ftab%3Dbio");
  });

  it.each([
    ["an absolute URL", "https://evil.example/"],
    ["a protocol-relative URL", "//evil.example"],
    ["an API path", "/api/auth/sign-out"],
    ["a repeated value", ["/a", "/b"]],
  ])("drops %s as returnTo", async (_case, returnTo) => {
    await renderSignIn({ returnTo });

    expect(githubHref()).toBe("/api/auth/github");
  });

  it.each(Object.entries(SIGN_IN_ERRORS))("explains ?error=%s", async (code, message) => {
    await renderSignIn({ error: code });

    expect(screen.getByRole("alert").textContent).toBe(message);
  });

  it.each([["unknown code", "something_else"], ["inherited key", "constructor"]])(
    "shows the unexpected message for an %s",
    async (_case, error) => {
      await renderSignIn({ error });

      expect(screen.getByRole("alert").textContent).toBe(SIGN_IN_ERRORS.unexpected);
    },
  );

  it("ignores a repeated error parameter", async () => {
    await renderSignIn({ error: ["github_cancelled", "unexpected"] });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says the session ended for reason=session_ended (L03)", async () => {
    await renderSignIn({ reason: "session_ended", returnTo: "/admin" });

    expect(screen.getByRole("status").textContent).toBe("Your session ended. Sign in again.");
    expect(githubHref()).toBe("/api/auth/github?returnTo=%2Fadmin");
  });

  it("says nothing for another reason", async () => {
    await renderSignIn({ reason: "other" });

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("SignInContent (signed in)", () => {
  it("sends the user on to a safe returnTo", async () => {
    mocks.getPageSession.mockResolvedValueOnce(user(["mentee"]));

    await expect(renderSignIn({ returnTo: "/mentor" })).rejects.toThrow("NEXT_REDIRECT /mentor");
  });

  it.each([
    [["mentee"], undefined, "/mentors"],
    [["mentee", "operator"], "https://evil.example", "/admin"],
  ] as const)("sends %j home when returnTo is %s", async (roles, returnTo, target) => {
    mocks.getPageSession.mockResolvedValueOnce(user([...roles]));

    await expect(renderSignIn({ returnTo })).rejects.toThrow(`NEXT_REDIRECT ${target}`);
  });
});
