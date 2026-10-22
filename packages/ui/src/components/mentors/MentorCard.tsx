import { LocalTime } from "../../time/LocalTime";
import { MentorAvatar } from "./MentorAvatar";
import { SessionFacts, type MentorPrices } from "./SessionFacts";
import { TagList } from "./TagList";
import { publicWorkLabel, type StackTagKey } from "./vocabulary";

/** MentorListItem (spec #27) with prices preformatted by the page. */
export interface MentorCardProps {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  publicWorkUrl: string;
  /** Already cut at 280 characters on the server (spec #27). */
  bio: string;
  stackTags: readonly StackTagKey[];
  prices: MentorPrices;
  nextBookableSlotAt: string;
}

/**
 * One row of /mentors: who, what they have done, prices, next open time. A list row with a thin
 * line, not a floating card (R01.1); no rating, rank or count (N02).
 */
export function MentorCard({
  slug,
  displayName,
  avatarUrl,
  publicWorkUrl,
  bio,
  stackTags,
  prices,
  nextBookableSlotAt,
}: MentorCardProps) {
  return (
    <article className="flex gap-paragraph border-b border-border py-paragraph">
      <MentorAvatar displayName={displayName} avatarUrl={avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-related">
        <h2 className="text-heading-4 font-semibold">
          <a
            href={`/m/${slug}`}
            className="rounded-control text-foreground underline-offset-4 outline-none hover:underline focus-visible:focus-ring"
          >
            {displayName}
          </a>
        </h2>
        <TagList tags={stackTags} />
        <p className="line-clamp-3 max-w-measure text-body-small text-foreground">{bio}</p>
        <a
          href={publicWorkUrl}
          target="_blank"
          rel="noopener nofollow ugc"
          className="relative block w-fit max-w-full truncate rounded-control font-mono text-caption text-link underline underline-offset-4 outline-none focus-visible:focus-ring"
        >
          {publicWorkLabel(publicWorkUrl)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <div className="flex flex-wrap items-center gap-paragraph">
          <SessionFacts prices={prices} />
          <p className="text-caption text-muted-foreground">
            Next open time: <LocalTime iso={nextBookableSlotAt} />
          </p>
        </div>
      </div>
    </article>
  );
}
