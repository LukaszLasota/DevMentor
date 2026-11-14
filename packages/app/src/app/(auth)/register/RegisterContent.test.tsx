import type { SessionUser } from "@devmentor/core";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPageSession: vi.fn() }));

vi.mock("@/lib/session", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("@devmentor/core", () => ({
  homeFor: (roles: string[]) => (roles.includes("operator") ? "/admin" : "/mentors"),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("@/components/auth/EmailLinkRequest", () => ({
  EmailLinkRequest: (props: { purpose: string; returnTo?: string }) => (
    <form aria-label="Register" data-purpose={props.purpose} data-return-to={props.returnTo ?? "none"} />
  ),
}));

const { RegisterContent } = await import("./RegisterContent");

async function renderRegister(query: Record<string, string | string[] | undefined>) {
  render(await RegisterContent({ searchParams: Promise.resolve(query) }));
}

function user(roles: SessionUser["roles"]): SessionUser {
  return { id: "u1", email: "ola@devmentor.test", roles, githubLogin: null, avatarUrl: null, emailVerified: true };
}

beforeEach(() => {
  mocks.getPageSession.mockReset().mockResolvedValue(null);
});

describe("RegisterContent", () => {
  it("shows the email form and the sign-in link", async () => {
    await renderRegister({});

    expect(screen.getByRole("heading", { level: 1, name: "Create an account" })).toBeTruthy();
    const form = screen.getByRole("form", { name: "Register" });
    expect(form.getAttribute("data-purpose")).toBe("register");
    expect(form.getAttribute("data-return-to")).toBe("none");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("carries a safe returnTo into the link and back to sign-in; drops an unsafe one", async () => {
    await renderRegister({ returnTo: "/mentors?tag=go" });
    expect(screen.getByRole("form", { name: "Register" }).getAttribute("data-return-to")).toBe("/mentors?tag=go");
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in?returnTo=%2Fmentors%3Ftag%3Dgo");
  });

  it("drops an unsafe returnTo", async () => {
    await renderRegister({ returnTo: "https://evil.example/" });
    expect(screen.getByRole("form", { name: "Register" }).getAttribute("data-return-to")).toBe("none");
  });

  it.each([
    [["mentee"], "/mentors?tag=go", "/mentors?tag=go"],
    [["mentee", "operator"], undefined, "/admin"],
  ] as const)("sends a signed-in %j user on (returnTo %s)", async (roles, returnTo, target) => {
    mocks.getPageSession.mockResolvedValueOnce(user([...roles]));

    await expect(renderRegister({ returnTo })).rejects.toThrow(`NEXT_REDIRECT ${target}`);
  });
});
