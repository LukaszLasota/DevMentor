import { withScope } from "@devmentor/core";
import { EmptyState } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { SlotsEditor } from "./SlotsEditor";

/**
 * /mentor/slots body, mentors only: the upcoming slots are read server-side and handed to the client
 * editor. A mentor without a profile gets the explanation, never an implicit profile (as #23).
 */
export async function SlotsContent() {
  const user = await requirePageRole("/mentor/slots", "mentor");
  const slots = await withScope(async ({ mentorProfileService, slotService }) =>
    (await mentorProfileService.findOwn(user.id)) === null ? null : slotService.listMine(user.id, "upcoming"),
  );

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Open times</h1>
      {slots === null ? (
        <EmptyState
          title="You have no mentor page yet"
          description="A page is created when you accept a mentor invitation. Ask the operator for one."
        />
      ) : (
        <SlotsEditor initial={slots} />
      )}
    </>
  );
}
