import { INVITATIONS_STOPPED_MESSAGE } from "@devmentor/core";
import { StackTags } from "@devmentor/core/validators";
import { RoleNotice } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { InvitationsBoard } from "./InvitationsBoard";

/**
 * /admin/invitations body, operators only (spec 2026-11-24-invitation-batches). The guard runs here
 * too: the layout guard does not re-run on client navigation.
 */
export async function InvitationsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageRole("/admin/invitations", "operator");
  const { notice } = await searchParams;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading-1 font-semibold">Invitations</h1>
        <p className="text-muted-foreground">Batches of 20 invitations and who published a slot within two weeks.</p>
      </div>
      <RoleNotice notice={notice} />
      <InvitationsBoard tagOptions={StackTags.options()} stoppedMessage={INVITATIONS_STOPPED_MESSAGE} />
    </>
  );
}
