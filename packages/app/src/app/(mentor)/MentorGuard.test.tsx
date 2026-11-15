import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePageRole: vi.fn() }));

vi.mock("@/lib/session", () => ({ requirePageRole: mocks.requirePageRole }));

const { MentorGuard } = await import("./MentorGuard");

beforeEach(() => {
  mocks.requirePageRole.mockReset();
});

describe("MentorGuard", () => {
  it("renders its children for a mentor", async () => {
    mocks.requirePageRole.mockResolvedValueOnce({ id: "u1" });

    await expect(MentorGuard({ children: "mentor" })).resolves.toBe("mentor");
    expect(mocks.requirePageRole).toHaveBeenCalledWith("/mentor", "mentor");
  });

  it("lets the guard's redirect through (non-mentor → home with notice=mentor_only)", async () => {
    mocks.requirePageRole.mockRejectedValueOnce(new Error("NEXT_REDIRECT /mentors?notice=mentor_only"));

    await expect(MentorGuard({ children: "mentor" })).rejects.toThrow("NEXT_REDIRECT");
  });
});
