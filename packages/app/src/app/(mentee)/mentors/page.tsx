import type { Metadata } from "next";
import { Suspense } from "react";
import { MentorListSkeleton } from "@devmentor/ui/mentors";
import { MentorsContent } from "./MentorsContent";

export const metadata: Metadata = {
  title: "Find a mentor · DevMentor",
  // Q1: the list and the share pages are not indexed in 1.0.
  robots: { index: false, follow: false },
};

// /mentors (spec 2026-10-21-mentor-list): public — signed-out visitors browse; signed-in users see it
// inside their shell (the (mentee) layout shows the account bar and sidebar only with a session).
// Static shell: the heading and the order line. The filter, the notice and the list depend on the
// request (query, clock) and stream inside <Suspense> with the list skeleton.
export default function MentorsPage({ searchParams }: PageProps<"/mentors">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <header className="flex flex-col gap-related">
        <h1 className="text-heading-1 font-semibold">Find a mentor</h1>
        <p className="text-body-small text-muted-foreground">Mentors who most recently published open times come first.</p>
      </header>
      <Suspense fallback={<MentorListSkeleton />}>
        <MentorsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
