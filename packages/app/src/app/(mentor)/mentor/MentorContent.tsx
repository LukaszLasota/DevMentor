import { withScope } from "@devmentor/core";
import { LocalTime, ReadinessChecklist, RoleNotice, type ReadinessItem } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";

// The onboarding steps of s06. The page step links to /mentor/profile (#23); prices (#24) and slots
// (#25) get their pages and `met` checks with those stories and are listed without a link until then.
function steps(published: boolean): ReadinessItem[] {
  return [
    { key: "published", label: "Publish your page", met: published, href: "/mentor/profile", actionLabel: "Edit your page" },
    { key: "prices", label: "Set your prices", met: false },
    { key: "slot", label: "Publish a slot", met: false },
  ];
}

/**
 * /mentor body, mentors only (s06): the one thing D13 measures — "Publish at least one bookable
 * session by <date>" (the first accepted invitation's deadline, in the viewer's time zone after
 * hydration) — and the steps towards it. `?notice=` explains a redirect here from another role's page (L03).
 */
export async function MentorContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("/mentor", "mentor");
  const { notice } = await searchParams;
  const own = await withScope(({ mentorProfileService }) => mentorProfileService.findOwn(user.id));
  const publishDueAt = own?.initialPublishDueAt ?? null;

  return (
    <>
      <h1 className="text-heading-1 font-semibold">Your mentor page</h1>
      <RoleNotice notice={notice} />
      <ReadinessChecklist
        className="max-w-measure"
        title={
          publishDueAt === null ? (
            "Publish at least one bookable session"
          ) : (
            <>
              Publish at least one bookable session by <LocalTime iso={publishDueAt} format="date" />
            </>
          )
        }
        items={steps(own?.publishedAt != null)}
      />
    </>
  );
}
