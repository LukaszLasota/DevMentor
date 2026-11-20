import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { ProfileContent } from "./ProfileContent";

export const metadata: Metadata = {
  title: "Your page · DevMentor",
};

// /mentor/profile (spec 2026-10-21-mentor-page): the session and the profile are request-time data,
// read inside <Suspense>.
export default function MentorProfilePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <ProfileContent />
      </Suspense>
    </main>
  );
}
