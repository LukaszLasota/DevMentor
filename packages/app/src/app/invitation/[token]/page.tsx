import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { InvitationContent } from "./InvitationContent";

export const metadata: Metadata = {
  title: "Mentor invitation · DevMentor",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// The state depends on the token and the viewer's session (request-time data), so the content
// renders inside <Suspense> (cacheComponents).
export default function InvitationPage({ params }: PageProps<"/invitation/[token]">) {
  return (
    <Suspense fallback={<LoadingMessage className="mx-auto max-w-dialog" />}>
      <InvitationContent params={params} />
    </Suspense>
  );
}
