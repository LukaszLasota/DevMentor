import { requirePageRole } from "@/lib/session";

/**
 * Mentor-only gate of the `(mentor)` layout. Every mentor page.tsx calls `requirePageRole` itself
 * too (a layout does not re-run on client navigation) and passes its exact path as `returnTo`.
 */
export async function MentorGuard({ children }: { children: React.ReactNode }) {
  await requirePageRole("/mentor", "mentor");

  return children;
}
