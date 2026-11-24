import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { InvitationsContent } from "./InvitationsContent";

export default function InvitationsPage({ searchParams }: PageProps<"/admin/invitations">) {
  return (
    <main className="mx-auto flex max-w-5xl min-w-0 flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <InvitationsContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
