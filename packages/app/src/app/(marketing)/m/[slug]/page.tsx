import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatMoney } from "@devmentor/core";
import { MentorPageView } from "@devmentor/ui/mentors";
import { loadPublicMentor } from "./load-public-mentor";

// The mentor's share page (spec 2026-10-21-mentor-page). The page is partially prerendered under
// cacheComponents, so its stream starts with 200: the true HTTP 404 for an unknown or unpublished page
// is decided earlier, in `src/proxy.ts`. `instant = false` lets `next build` accept this blocking,
// request-time read; no `loading.tsx`, no `generateStaticParams`, no `use cache` — the build never
// touches the database.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const page = await loadPublicMentor((await params).slug);

  return { title: page === null ? "Page not found · DevMentor" : `${page.displayName} · DevMentor` };
}

export default async function MentorSharePage({ params }: PageProps<"/m/[slug]">) {
  const page = await loadPublicMentor((await params).slug);

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

  // The true 404 status comes from `src/proxy.ts`; `notFound()` above covers a page hidden in between.
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-paragraph py-section">
      <MentorPageView
        displayName={page.displayName}
        avatarUrl={page.avatarUrl}
        publicWorkUrl={page.publicWorkUrl}
        bio={page.bio}
        stackTags={page.stackTags}
        offerReady={page.offerReady}
        prices={prices}
        slots={page.slots}
      />
    </main>
  );
}
