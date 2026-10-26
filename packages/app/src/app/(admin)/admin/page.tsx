import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { AdminContent } from "./AdminContent";

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">
      <Suspense fallback={<LoadingMessage />}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
