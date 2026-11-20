import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { withScope } from "@devmentor/core";
import { MentorPageView } from "@devmentor/ui/mentors";

// The mentor's share page (spec 2026-10-21-mentor-page). A true HTTP 404 for an unknown or unpublished
// page: the page is read and `notFound()` called before any <Suspense> boundary, so the status is
// decided before streaming starts (next/dist/docs/01-app/02-guides/streaming.md, "The HTTP contract").
// `instant = false` lets `next build` accept this blocking, request-time read; no `loading.tsx`, no
// `generateStaticParams`, no `use cache` — the build never touches the database.
export const instant = false;

/** One database read per request, shared by the metadata and the page. */
const findPage = cache((slug: string) => withScope(({ mentorProfileService }) => mentorProfileService.findPublicBySlug(slug)));

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const page = await findPage((await params).slug);

  return { title: page === null ? "Page not found · DevMentor" : `${page.displayName} · DevMentor` };
}

export default async function MentorSharePage({ params }: PageProps<"/m/[slug]">) {
  const page = await findPage((await params).slug);

  if (page === null) {
    notFound();
  }

  // Prices (#24) and slots (#25) are not part of 1.0's first page: "Not bookable yet" until the
  // mentor is `mentorOfferReady` with those stories.
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-paragraph py-section">
      <MentorPageView
        displayName={page.displayName}
        avatarUrl={page.avatarUrl}
        publicWorkUrl={page.publicWorkUrl}
        bio={page.bio}
        stackTags={page.stackTags}
        offerReady={false}
        prices={null}
        slots={[]}
      />
    </main>
  );
}
