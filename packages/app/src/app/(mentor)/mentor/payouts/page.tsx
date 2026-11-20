import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { PayoutsContent } from "./PayoutsContent";

export const metadata: Metadata = {
  title: "Payouts · DevMentor",
};

// /mentor/payouts (spec 2026-11-21-mentor-payouts): the session and the stored Connect state are
// request-time data, read inside <Suspense>. Stripe sends the mentor back here (`?connect=return|reauth`).
export default function MentorPayoutsPage({ searchParams }: PageProps<"/mentor/payouts">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <PayoutsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
