import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageSession: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageSession: mocks.requirePageSession }));

const { MentorsContent } = await import("./MentorsContent");

beforeEach(() => {
  mocks.requirePageSession.mockReset().mockResolvedValue({ id: "u1", roles: ["mentee"] });
});

describe("MentorsContent", () => {
  it("guards /mentors for any signed-in user and shows the placeholder (s05, L01)", async () => {
    render(await MentorsContent({ searchParams: Promise.resolve({}) }));

    expect(mocks.requirePageSession).toHaveBeenCalledWith("/mentors");
    expect(screen.getByRole("heading", { level: 1, name: "Mentors" })).toBeTruthy();
    expect(screen.getByText("The mentor list is not here yet")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says why a mentee was sent here from the admin page (L03)", async () => {
    render(await MentorsContent({ searchParams: Promise.resolve({ notice: "operator_only" }) }));

    expect(screen.getByRole("status").textContent).toBe("This page is for operators.");
  });

  it("renders nothing when the guard redirects", async () => {
    mocks.requirePageSession.mockRejectedValueOnce(new Error("NEXT_REDIRECT /sign-in?returnTo=%2Fmentors"));

    await expect(MentorsContent({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT");
  });
});
