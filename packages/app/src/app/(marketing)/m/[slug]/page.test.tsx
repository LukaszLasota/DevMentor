import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findPublicBySlug: vi.fn(), notFound: vi.fn() }));

const env = vi.hoisted(() => ({ APP_URL: "https://app.devmentor.test" as string | undefined }));

vi.mock("@devmentor/core", () => ({
  getEnv: () => env,
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  withScope: <T,>(fn: (cradle: unknown) => Promise<T>) =>
    fn({ mentorProfileService: { findPublicBySlug: mocks.findPublicBySlug } }),
}));
vi.mock("./BookSlot", () => ({
  BookSlot: (props: { slotId: string; lengths: string[]; prices: Record<string, string>; slug: string }) => (
    <button type="button">{`Book ${props.slotId} ${props.lengths.join("/")} ${props.prices["25"]} ${props.slug}`}</button>
  ),
}));
vi.mock("./CheckoutCancelled", () => ({
  CheckoutCancelled: ({ bookingId }: { bookingId: string | null }) => <p>{`cancelled:${bookingId}`}</p>,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
}));

const { default: MentorSharePage, DESCRIPTION_MAX, generateMetadata, instant, previewDescription } = await import("./page");

const PAGE = {
  slug: "ada-lovelace",
  displayName: "Ada Lovelace",
  avatarUrl: null,
  publicWorkUrl: "https://github.com/ada/engine",
  bio: "Wrote the first program.\nFor an engine that was never built.",
  stackTags: ["python", "ai-agents"],
  offerReady: false,
  prices: null as { price25Cents: number; price50Cents: number; currency: string } | null,
  slots: [] as { id: string; startsAt: string; meetsLeadTime: boolean; bookableLengths: ("25" | "50")[] }[],
};
const props = (slug: string, searchParams: Record<string, string | string[]> = {}) => ({
  params: Promise.resolve({ slug }),
  searchParams: Promise.resolve(searchParams),
});

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
      prices: { price25Cents: 15000, price50Cents: 30000, currency: "PLN" },
      slots: [
        { id: "a", startsAt: "2026-06-22T16:30:00.000Z", meetsLeadTime: false, bookableLengths: [] },
        { id: "b", startsAt: "2026-06-23T09:00:00.000Z", meetsLeadTime: true, bookableLengths: ["25", "50"] },
      ],
    });

    render(await MentorSharePage(props("ada-lovelace")));

    const items = screen.getByRole("list", { name: "Open times" }).querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]?.getAttribute("aria-disabled")).toBe("true");
    expect(items[0]?.textContent).toContain("Starts in less than two hours — no longer bookable");
    expect(items[1]?.getAttribute("aria-disabled")).toBeNull();
    expect(screen.queryByText("Not bookable yet")).toBeNull();
    expect(screen.getByRole("list", { name: "Session prices" }).textContent).toBe("25 minPLN 150.0050 minPLN 300.00");
    // Booking controls only on the bookable time, with the formatted prices (spec #29).
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Book b 25/50 PLN 150.00 ada-lovelace"]);
    expect(document.body.textContent).not.toMatch(/\b(ratings?|scores?|reviews?|rank(ing)?|stars?|guaranteed|reserved)\b/i);
  });

  it("offers no booking controls for a mentor who is offer-ready without prices", async () => {
    mocks.findPublicBySlug.mockResolvedValue({
      ...PAGE,
      offerReady: true,
      slots: [{ id: "b", startsAt: "2026-06-23T09:00:00.000Z", meetsLeadTime: true, bookableLengths: ["25"] }],
    });

    render(await MentorSharePage(props("ada-lovelace")));

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the cancelled-payment notice with the booking to release, only for ?checkout=cancelled", async () => {
    render(await MentorSharePage(props("ada-lovelace", { checkout: "cancelled", booking: "b-1" })));
    expect(screen.getByText("cancelled:b-1")).toBeTruthy();
  });

  it.each([
    [{ checkout: "cancelled" }, "cancelled:null"],
    [{ checkout: "cancelled", booking: ["x", "y"] }, "cancelled:null"],
  ])("passes no booking id for %o", async (query, text) => {
    render(await MentorSharePage(props("ada-lovelace", query)));
    expect(screen.getByText(text)).toBeTruthy();
  });

  it("shows no notice without ?checkout=cancelled", async () => {
    render(await MentorSharePage(props("ada-lovelace", { checkout: "done" })));
    expect(screen.queryByText(/cancelled:/)).toBeNull();
  });

  it("shows no prices for a mentor who is not offer-ready, even with stored prices", async () => {
    mocks.findPublicBySlug.mockResolvedValue({ ...PAGE, prices: { price25Cents: 15000, price50Cents: 30000, currency: "PLN" } });

    render(await MentorSharePage(props("ada-lovelace")));

    expect(screen.getByText("Not bookable yet")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Session prices" })).toBeNull();
  });

  it("calls notFound() for a page that is not public", async () => {
    mocks.findPublicBySlug.mockResolvedValue(null);

    await expect(MentorSharePage(props("nobody"))).rejects.toThrow("404");
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("describes a known mentor for previews: title, one-line bio, Open Graph; always noindex", async () => {
    expect(await generateMetadata(props("ada-lovelace"))).toEqual({
      title: "Ada Lovelace · DevMentor",
      description: "Wrote the first program. For an engine that was never built.",
      robots: { index: false, follow: false },
      openGraph: {
        title: "Ada Lovelace · DevMentor",
        description: "Wrote the first program. For an engine that was never built.",
        type: "profile",
        url: "https://app.devmentor.test/m/ada-lovelace",
      },
    });
  });

  it("leaves the Open Graph url out without APP_URL", async () => {
    env.APP_URL = undefined;

    try {
      expect((await generateMetadata(props("ada-lovelace"))).openGraph).not.toHaveProperty("url");
    } finally {
      env.APP_URL = "https://app.devmentor.test";
    }
  });

  it("gives an unknown slug a generic title, no mentor data, noindex — and no notFound()", async () => {
    mocks.findPublicBySlug.mockResolvedValue(null);

    expect(await generateMetadata(props("nobody"))).toEqual({ title: "DevMentor", robots: { index: false, follow: false } });
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("cuts a long bio at 160 characters on one line", () => {
    const description = previewDescription(`${"word ".repeat(50)}\n\nend`);

    expect(description).toHaveLength(DESCRIPTION_MAX);
    expect(description.endsWith("…")).toBe(true);
    expect(description).not.toContain("\n");
    expect(previewDescription("  short\n bio ")).toBe("short bio");
    expect(previewDescription("🚀".repeat(200))).toBe(`${"🚀".repeat(DESCRIPTION_MAX - 1)}…`);
  });
});
