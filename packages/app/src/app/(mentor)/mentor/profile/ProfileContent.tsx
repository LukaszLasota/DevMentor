import { withScope } from "@devmentor/core";
import { StackTags } from "@devmentor/core/validators";
import { EmptyState } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";
import { ProfileEditor } from "./ProfileEditor";

/**
 * /mentor/profile body, mentors only: reads the owner DTO server-side (spec decision f) and hands the
 * editor plain data — the vocabulary options and the share-link base (`APP_URL`, relative without it).
 */
export async function ProfileContent() {
  const user = await requirePageRole("/mentor/profile", "mentor");
  const { own, appUrl } = await withScope(async ({ mentorProfileService, env }) => ({
    own: await mentorProfileService.findOwn(user.id),
    appUrl: env.APP_URL ?? "",
  }));

  if (own === null) {
    return (
      <>
        <h1 className="text-heading-1 font-semibold">Your page</h1>
        <EmptyState
          title="You have no mentor page yet"
          description="A page is created when you accept a mentor invitation. Ask the operator for one."
        />
      </>
    );
  }

  return <ProfileEditor initial={own} tagOptions={StackTags.options()} shareBase={`${appUrl}/m/`} />;
}
