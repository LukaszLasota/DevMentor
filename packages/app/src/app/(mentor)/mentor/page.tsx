import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { MentorContent } from "./MentorContent";

export const metadata: Metadata = {
  title: "Your mentor page · DevMentor",
};

// Mentor home (s06). The session, the profile and the query are request-time data, read inside <Suspense>.
export default function MentorPage({ searchParams }: PageProps<"/mentor">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <MentorContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
