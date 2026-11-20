import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { BookingContent } from "./BookingContent";

export const metadata: Metadata = {
  title: "Your booking · DevMentor",
  robots: { index: false, follow: false },
};

// Where Stripe Checkout returns (spec #29, success_url). The session and the booking are request-time
// data, read inside <Suspense>.
export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <BookingContent params={params} />
      </Suspense>
    </main>
  );
}
