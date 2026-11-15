import { withScope } from "@devmentor/core";
import { LocalTime, ReadinessChecklist, RoleNotice, type ReadinessItem } from "@devmentor/ui";
import { requirePageRole } from "@/lib/session";

// The onboarding steps of s06; each gets its page and its `met` check with #23 (page), #24
// (prices) and #25 (slots). Until then they are listed without a link.
const STEPS: ReadinessItem[] = [
  { key: "published", label: "Publish your page", met: false },
  { key: "prices", label: "Set your prices", met: false },
  { key: "slot", label: "Publish a slot", met: false },
];

/**
 * /mentor body, mentors only (s06): the one thing D13 measures — "Publish at least one bookable
 * session by <date>" (the first accepted invitation's deadline, in the viewer's time zone after
 * hydration) — and the steps towards it. `?notice=` explains a redirect here from another role's page (L03).
 */
export async function MentorContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("/mentor", "mentor");
  const { notice } = await searchParams;
  const publishDueAt = await withScope(({ mentorProfileService }) => mentorProfileService.publishDueAt(user.id));

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
              Publish at least one bookable session by <LocalTime iso={publishDueAt.toISOString()} format="date" />
            </>
          )
        }
        items={STEPS}
      />
    </>
  );
}
