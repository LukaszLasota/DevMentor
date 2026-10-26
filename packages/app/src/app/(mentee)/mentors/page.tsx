import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { MentorsContent } from "./MentorsContent";

export const metadata: Metadata = {
  title: "Mentors · DevMentor",
};

// Mentee home (s05, L01). The session and the query are request-time data, read inside <Suspense>.
export default function MentorsPage({ searchParams }: PageProps<"/mentors">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <MentorsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
