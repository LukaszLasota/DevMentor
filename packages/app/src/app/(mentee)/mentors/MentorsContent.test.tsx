import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listBookable: vi.fn(), connection: vi.fn(async () => undefined) }));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("@devmentor/core", () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) => fn({ mentorListService: { listBookable: mocks.listBookable } }),
}));

const { MentorsContent } = await import("./MentorsContent");

const item = (slug: string, stackTags: string[]) => ({
  slug,
  displayName: slug.toUpperCase(),
  avatarUrl: null,
  publicWorkUrl: `https://github.com/${slug}`,
  bio: `${slug} builds things.`,
  stackTags,
  prices: { price25Cents: 15000, price50Cents: 30000, currency: "PLN" },
  nextBookableSlotAt: "2026-06-23T09:00:00.000Z",
});
const query = (params: Record<string, string | string[]>) => ({ searchParams: Promise.resolve(params) });
const noScores = () =>
  expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?|top|search)\b/i);

beforeEach(() => {
  mocks.listBookable.mockReset().mockResolvedValue([item("ada", ["python"]), item("bob", ["react"])]);
  mocks.connection.mockClear();
});

describe("MentorsContent (/mentors, #27)", () => {
  it("lists every bookable mentor as cards in an unnumbered list, read at request time", async () => {
    render(await MentorsContent(query({})));

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.listBookable).toHaveBeenCalledWith({});
    expect(document.querySelector("ol")).toBeNull();
    expect(document.querySelectorAll("main > ul > li, ul > li > article").length).toBe(2);
    expect(screen.getByRole("link", { name: "ADA" }).getAttribute("href")).toBe("/m/ada");
    expect(screen.getAllByRole("list", { name: "Session prices" })[0]?.textContent).toBe("25 minPLN 150.0050 minPLN 300.00");
    expect(screen.getByRole("navigation", { name: "Filter by stack tag" })).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();
    noScores();
  });

  it("passes one tag and marks it current", async () => {
    render(await MentorsContent(query({ tag: "react" })));

    expect(mocks.listBookable).toHaveBeenCalledWith({ tag: "react" });
    const filter = screen.getByRole("navigation", { name: "Filter by stack tag" });
    expect(within(filter).getByRole("link", { name: "React" }).getAttribute("aria-current")).toBe("page");
  });

  it("says nobody has open times when the list is empty", async () => {
    mocks.listBookable.mockResolvedValue([]);

    render(await MentorsContent(query({})));

    expect(screen.getByText("No mentors have open times right now. Check back soon.")).toBeTruthy();
  });

  it("says nobody for this tag and links to all", async () => {
    mocks.listBookable.mockResolvedValue([]);

    render(await MentorsContent(query({ tag: "python" })));

    expect(screen.getByText("No Python mentors have open times right now.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Show all mentors" }).getAttribute("href")).toBe("/mentors");
  });

  it.each([["rust"], ["REACT"], [["react", "python"]]])("shows the unknown-tag state for %j without reading the list", async (tag) => {
    render(await MentorsContent(query({ tag })));

    expect(screen.getByText("Unknown stack tag.")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Filter by stack tag" })).toBeTruthy();
    expect(mocks.listBookable).not.toHaveBeenCalled();
  });

  it("explains a redirect here from another role's page (L03)", async () => {
    render(await MentorsContent(query({ notice: "mentor_only" })));

    expect(screen.getByRole("status").textContent).toBe("This page is for mentors.");
  });
});
