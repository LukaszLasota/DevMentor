import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMoney, getEnv } from "@devmentor/core";
import { MentorPageView } from "@devmentor/ui/mentors";
import { BookSlot } from "./BookSlot";
import { CheckoutCancelled } from "./CheckoutCancelled";
import { loadPublicMentor } from "./load-public-mentor";

// The mentor's share page (spec 2026-10-21-mentor-page). The page is partially prerendered under
// cacheComponents, so its stream starts with 200: the true HTTP 404 for an unknown or unpublished page
// is decided earlier, in `src/proxy.ts`. `instant = false` lets `next build` accept this blocking,
// request-time read; no `loading.tsx`, no `generateStaticParams`, no `use cache` — the build never
// touches the database.
export const instant = false;

/** Longest share-preview description; the full bio stays on the page. */
export const DESCRIPTION_MAX = 160;

/** The bio on one line, cut at 160 characters with an ellipsis (share previews, search snippets). */
export function previewDescription(bio: string): string {
  const line = bio.replace(/\s+/g, " ").trim();

  // By code point, so an emoji is never cut in half.
  const chars = Array.from(line);

  return chars.length <= DESCRIPTION_MAX ? line : `${chars.slice(0, DESCRIPTION_MAX - 1).join("").trimEnd()}…`;
}

/**
 * Always `noindex` (Q1). A known mentor gets the display name as the title, the bio as the
 * description and Open Graph for link previews; an unknown slug gets a generic title and no mentor
 * data. Never calls `notFound()`: the 404 status comes from the proxy and the page.
 */
export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = await loadPublicMentor(slug);
  const robots = { index: false, follow: false };

  if (page === null) {
    return { title: "DevMentor", robots };
  }

  const title = `${page.displayName} · DevMentor`;
  const description = previewDescription(page.bio);
  const appUrl = getEnv().APP_URL;

  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "profile", ...(appUrl === undefined ? {} : { url: `${appUrl}/m/${slug}` }) },
  };
}

/** One value of a search param, or `null` (repeated or absent). */
function single(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

export default async function MentorSharePage({ params, searchParams }: PageProps<"/m/[slug]">) {
  const slug = (await params).slug;
  const query = await searchParams;
  const page = await loadPublicMentor(slug);

  if (page === null) {
    notFound();
  }

  // `offerReady` is the `mentorOfferReady` gate at request time (published, settings, both prices within
  // the bounds, a bookable slot); prices and slots show only when it holds, each slot with its lead-time
  // state for this request (nothing here is cached). Prices are formatted here: ui never imports core.
  const prices =
    page.offerReady && page.prices !== null
      ? { price25: formatMoney(page.prices.price25Cents, page.prices.currency), price50: formatMoney(page.prices.price50Cents, page.prices.currency) }
      : null;

  // Booking controls per open time (spec #29): a client island per slot, prices formatted here.
  const bookingPrices =
    page.prices === null
      ? null
      : { "25": formatMoney(page.prices.price25Cents, page.prices.currency), "50": formatMoney(page.prices.price50Cents, page.prices.currency) };
  const cancelled = single(query.checkout) === "cancelled";

  // The true 404 status comes from `src/proxy.ts`; `notFound()` above covers a page hidden in between.
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-section px-paragraph py-section">
      {cancelled ? <CheckoutCancelled bookingId={single(query.booking)} /> : null}
      <MentorPageView
        displayName={page.displayName}
        avatarUrl={page.avatarUrl}
        publicWorkUrl={page.publicWorkUrl}
        bio={page.bio}
        stackTags={page.stackTags}
        offerReady={page.offerReady}
        prices={prices}
        slots={page.slots}
        renderSlotAction={
          page.offerReady && bookingPrices !== null
            ? (slot) => (
                <BookSlot slug={page.slug} slotId={slot.id} startsAt={slot.startsAt} lengths={slot.bookableLengths} prices={bookingPrices} />
              )
            : undefined
        }
      />
    </main>
  );
}
