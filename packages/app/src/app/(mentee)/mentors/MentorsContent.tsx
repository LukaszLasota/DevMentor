import { EmptyState, RoleNotice } from "@devmentor/ui";
import { requirePageSession } from "@/lib/session";

/**
 * /mentors body: where every signed-in user lands by default (L01). Any role may browse mentors.
 * `?notice=` explains a redirect here from another role's page (L03). The list itself is Epic 02 (#27).
 */
export async function MentorsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageSession("/mentors");
  const { notice } = await searchParams;

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Mentors</h1>
      <RoleNotice notice={notice} />
      <EmptyState
        title="The mentor list is not here yet"
        description="It arrives with Epic 02 (#27). After you sign in, you land on this page."
      />
    </>
  );
}
