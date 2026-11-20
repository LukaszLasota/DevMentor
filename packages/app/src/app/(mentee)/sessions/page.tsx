import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { SessionsContent } from "./SessionsContent";

export const metadata: Metadata = {
  title: "My sessions · DevMentor",
  robots: { index: false, follow: false },
};

export default function SessionsPage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <SessionsContent />
      </Suspense>
    </main>
  );
}
