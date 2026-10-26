import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { AdminContent } from "./AdminContent";

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Suspense fallback={<LoadingMessage />}>
        <AdminContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
