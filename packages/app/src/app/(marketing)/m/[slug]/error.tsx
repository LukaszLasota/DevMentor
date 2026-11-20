"use client";

import { buttonVariants } from "@devmentor/ui/mentors";

/**
 * The mentor page could not be read (e.g. the database is down; spec #28). No error detail; a retry
 * re-renders the segment.
 */
export default function MentorPageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-start gap-paragraph px-paragraph py-section">
      <p className="text-body">This mentor page cannot be shown right now. Try again in a minute.</p>
      <button type="button" className={buttonVariants({ size: "md" })} onClick={() => reset()}>
        Try again
      </button>
    </main>
  );
}
