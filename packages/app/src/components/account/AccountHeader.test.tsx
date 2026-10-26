import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPageSession: vi.fn() }));

vi.mock("@/lib/session", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("./SignOutAction", () => ({ SignOutAction: () => <button>Sign out</button> }));

const { AccountHeader } = await import("./AccountHeader");

beforeEach(() => {
  mocks.getPageSession.mockReset();
});

describe("AccountHeader", () => {
  it("renders the account bar of the signed-in user", async () => {
    mocks.getPageSession.mockResolvedValueOnce({
      id: "u1",
      email: "adam@devmentor.test",
      roles: ["mentee", "mentor", "operator"],
      githubLogin: "adam-b",
      avatarUrl: null,
      emailVerified: true,
    });

    render(await AccountHeader({ area: "Admin" }));

    expect(screen.getByRole("banner").textContent).toContain("adam@devmentor.test");
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Mentor", "Admin"]);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("renders nothing without a session", async () => {
    mocks.getPageSession.mockResolvedValueOnce(null);

    await expect(AccountHeader({})).resolves.toBeNull();
  });
});
