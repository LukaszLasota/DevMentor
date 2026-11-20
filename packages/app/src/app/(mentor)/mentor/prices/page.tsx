import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { PricesContent } from "./PricesContent";

export const metadata: Metadata = {
  title: "Prices · DevMentor",
};

// /mentor/prices (spec 2026-10-21-mentor-prices): the session, the prices and the bounds are
// request-time data, read inside <Suspense>.
export default function MentorPricesPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <PricesContent />
      </Suspense>
    </main>
  );
}
