import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { SlotsContent } from "./SlotsContent";

export const metadata: Metadata = {
  title: "Open times · DevMentor",
};

// /mentor/slots (spec 2026-10-21-availability-slots): the session and the slots are request-time
// data, read inside <Suspense>.
export default function MentorSlotsPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <SlotsContent />
      </Suspense>
    </main>
  );
}
