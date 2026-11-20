import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findPublicBySlug: vi.fn(), notFound: vi.fn() }));

vi.mock("@devmentor/core", () => ({
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) =>
    fn({ mentorProfileService: { findPublicBySlug: mocks.findPublicBySlug } }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { default: MentorSharePage, generateMetadata, instant } = await import("./page");

const PAGE = {
  slug: "ada-lovelace",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  publicWorkUrl: "https://github.com/ada/engine",
  bio: "Wrote the first program.\nFor an engine that was never built.",
  stackTags: ["python", "ai-agents"],
  offerReady: false,
  slots: [] as { id: string; startsAt: string; meetsLeadTime: boolean }[],
};
const props = (slug: string) => ({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });

beforeEach(() => {
  mocks.findPublicBySlug.mockReset().mockResolvedValue(PAGE);
  mocks.notFound.mockReset();
});

describe("/m/[slug]", () => {
  it("is a blocking route (instant = false) so the 404 is decided before streaming", () => {
    expect(instant).toBe(false);
  });

  it("shows the public page: name, link, bio as text, tags and Not bookable yet — no rating of any kind", async () => {
    render(await MentorSharePage(props("ada-lovelace")));

    expect(mocks.findPublicBySlug).toHaveBeenCalledWith("ada-lovelace");
    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeTruthy();
    const link = screen.getByRole("link", { name: /github\.com\/ada\/engine/ });
    expect(link.getAttribute("href")).toBe(PAGE.publicWorkUrl);
    expect(link.getAttribute("rel")).toBe("noopener nofollow ugc");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/Wrote the first program\./).textContent).toBe(PAGE.bio);
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Python", "AI agents"]);
    expect(screen.getByText("Not bookable yet")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?)\b/i);
  });

  it("lists open times of an offer-ready mentor, a slot past its lead time disabled with the reason", async () => {
    mocks.findPublicBySlug.mockResolvedValue({
      ...PAGE,
      offerReady: true,
      slots: [
        { id: "a", startsAt: "2026-06-22T16:30:00.000Z", meetsLeadTime: false },
        { id: "b", startsAt: "2026-06-23T09:00:00.000Z", meetsLeadTime: true },
      ],
    });

    render(await MentorSharePage(props("ada-lovelace")));

    const items = screen.getByRole("list", { name: "Open times" }).querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[0]?.textContent).toContain("Starts in less than two hours — no longer bookable");
    expect(items[1]?.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText("Not bookable yet")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?|guaranteed|reserved)\b/i);
  });

  it("calls notFound() for a page that is not public", async () => {
    mocks.findPublicBySlug.mockResolvedValue(null);

    await expect(MentorSharePage(props("nobody"))).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("titles the page with the display name, or as not found", async () => {
    expect(await generateMetadata(props("ada-lovelace"))).toEqual({ title: "Ada Lovelace · DevMentor" });

    mocks.findPublicBySlug.mockResolvedValue(null);
    expect(await generateMetadata(props("nobody"))).toEqual({ title: "Page not found · DevMentor" });
  });
});
