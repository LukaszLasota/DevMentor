import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { SessionContent } from "./SessionContent";

export const metadata: Metadata = {
  title: "Session · DevMentor",
  robots: { index: false, follow: false },
};

// A text session between a mentee and a mentor (spec 2026-11-20-text-session). Request-time data,
// read inside <Suspense>.
export default function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <SessionContent params={params} />
      </Suspense>
    </main>
  );
}
