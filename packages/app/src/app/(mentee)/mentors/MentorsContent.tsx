import { formatMoney, withScope } from "@devmentor/core";
import { getPageSession } from "@/lib/session";
import { mentorListQuerySchema } from "@devmentor/core/validators";
import { EmptyState, RoleNotice, TextLink } from "@devmentor/ui";
import { MentorCard, MentorTagFilter, stackTagLabel } from "@devmentor/ui/mentors";
import { connection } from "next/server";

/**
 * /mentors body (spec #27): the tag filter, every bookable mentor as a card (most recent published
 * availability first, never a rank), and the empty, filtered-empty and unknown-tag states. Public; no
 * session read. `?notice=` still explains a redirect here from another role's page (L03).
 */
export async function MentorsContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { notice, tag } = await searchParams;
  const query = mentorListQuerySchema.safeParse({ tag });

  if (!query.success) {
    // An unknown tag is a rendered state with HTTP 200 (the API answers 400).
    return (
      <>
        <RoleNotice notice={notice} />
        <MentorTagFilter active={false} />
        <p className="text-body-small font-medium">Unknown stack tag.</p>
      </>
    );
  }

  // Documents the request-time read (clock for the two-hour lead, database); awaiting searchParams
  // already keeps this subtree out of the prerender.
  await connection();
  const items = await withScope(({ mentorListService }) => mentorListService.listBookable(query.data));
  const active = query.data.tag ?? null;
  // Public page in the (mentee) shell: signed out (or with an ended session) there is no account bar,
  // so offer the way in here (review of #27).
  const signedIn = (await getPageSession()) !== null;

  return (
    <>
      <RoleNotice notice={notice} />
      {signedIn ? null : (
        <p className="text-body-small text-muted-foreground">
          <TextLink href="/sign-in?returnTo=%2Fmentors">Sign in</TextLink> to see your account.
        </p>
      )}
      <MentorTagFilter active={active} />
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.slug}>
              <MentorCard
                {...item}
                prices={{
                  price25: formatMoney(item.prices.price25Cents, item.prices.currency),
                  price50: formatMoney(item.prices.price50Cents, item.prices.currency),
                }}
              />
            </li>
          ))}
        </ul>
      ) : active === null ? (
        <EmptyState title="No mentors have open times right now. Check back soon." />
      ) : (
        <EmptyState
          title={`No ${stackTagLabel(active)} mentors have open times right now.`}
          action={<TextLink href="/mentors">Show all mentors</TextLink>}
        />
      )}
    </>
  );
}
