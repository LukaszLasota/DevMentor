import { Suspense } from "react";
import { LoadingMessage, RoleNotice } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { AttentionPanel } from "./AttentionPanel";
import { HealthPanel } from "./HealthPanel";

/** /admin body, operators only. `?notice=` explains a redirect here from another role's page (L03). */
export async function AdminContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("/admin", "operator");
  const { notice } = await searchParams;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-muted-foreground">System status.</p>
      </div>
      <RoleNotice notice={notice} />
      <HealthPanel />
      <Suspense fallback={<LoadingMessage />}>
        <AttentionPanel />
      </Suspense>
    </>
  );
}
