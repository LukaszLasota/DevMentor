import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPageSession: vi.fn() }));

vi.mock("@/lib/session", () => ({ getPageSession: mocks.getPageSession }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mentors" }));

const { AccountNav } = await import("./AccountNav");

beforeEach(() => {
  mocks.getPageSession.mockReset();
});

describe("AccountNav", () => {
  it("links the areas of the signed-in user's roles (L09)", async () => {
    mocks.getPageSession.mockResolvedValueOnce({
      id: "u1",
      email: "adam@devmentor.test",
      roles: ["mentee", "mentor", "operator"],
      githubLogin: "adam-b",
      avatarUrl: null,
      emailVerified: true,
    });

    render(await AccountNav());

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Mentors", "Mentor workspace", "Your page", "Dashboard"]);
    expect(screen.getByRole("link", { name: "Mentors" }).getAttribute("aria-current")).toBe("page");
  });

  it("renders nothing without a session", async () => {
    mocks.getPageSession.mockResolvedValueOnce(null);

    await expect(AccountNav()).resolves.toBeNull();
  });
});
