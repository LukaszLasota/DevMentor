// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findPublicBySlug: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ mentorProfileService: { findPublicBySlug: mocks.findPublicBySlug } }),
}));

const { loadPublicMentor } = await import("./load-public-mentor");

beforeEach(() => {
  mocks.findPublicBySlug.mockReset();
});

describe("loadPublicMentor", () => {
  it("answers the public page of a slug", async () => {
    mocks.findPublicBySlug.mockResolvedValue({ slug: "ada" });

    await expect(loadPublicMentor("ada")).resolves.toEqual({ slug: "ada" });
    expect(mocks.findPublicBySlug).toHaveBeenCalledWith("ada");
  });

  it("answers null for a page that is not public", async () => {
    mocks.findPublicBySlug.mockResolvedValue(null);

    await expect(loadPublicMentor("nobody")).resolves.toBeNull();
  });

  it("lets other failures propagate (the error boundary renders)", async () => {
    mocks.findPublicBySlug.mockRejectedValue(new Error("database down"));

    await expect(loadPublicMentor("ada")).rejects.toThrow("database down");
  });
});
