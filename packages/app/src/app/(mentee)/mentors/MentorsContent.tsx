import { formatMoney, withScope } from "@devmentor/core";
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
        <MentorTagFilter active={null} />
        <p className="text-body-small font-medium">Unknown stack tag.</p>
      </>
    );
  }

  // The list reads the clock (two-hour lead) and the database: request time, never prerendered.
  await connection();
  const items = await withScope(({ mentorListService }) => mentorListService.listBookable(query.data));
  const active = query.data.tag ?? null;

  return (
    <>
      <RoleNotice notice={notice} />
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
