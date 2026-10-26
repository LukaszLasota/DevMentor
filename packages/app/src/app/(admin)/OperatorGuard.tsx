import { requirePageRole } from "@/lib/session";

/**
 * Operator-only gate of the `(admin)` layout. Every admin page.tsx calls `requirePageRole` itself
 * too (a layout does not re-run on client navigation) and passes its exact path as `returnTo`.
 */
export async function OperatorGuard({ children }: { children: React.ReactNode }) {
  await requirePageRole("/admin", "operator");

  return children;
}
