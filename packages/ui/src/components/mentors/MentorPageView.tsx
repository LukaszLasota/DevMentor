import { LocalTime } from "../../time/LocalTime";
import { MentorAvatar } from "./MentorAvatar";
import { SessionFacts, type MentorPrices } from "./SessionFacts";
import { TagList } from "./TagList";
import { TextSessionNotice } from "./TextSessionNotice";
import { publicWorkLabel, type StackTagKey } from "./vocabulary";

export interface MentorPageSlot {
  id: string;
  startsAt: string;
  /** False once the slot is less than two hours away (spec #25). */
  meetsLeadTime: boolean;
}

/** MentorPublicView (specs #23–#25, #28) with prices preformatted by the page. */
export interface MentorPageViewProps {
  displayName: string;
  avatarUrl: string | null;
  publicWorkUrl: string;
  bio: string;
  stackTags: readonly StackTagKey[];
  offerReady: boolean;
  prices: MentorPrices | null;
  slots: readonly MentorPageSlot[];
}

/**
 * The share page /m/[slug] (spec #28): header, what they have done, public work, sessions. Same for
 * every visitor; no booking button, no reasons for "Not bookable yet" (spec #28), no ratings (N02).
 */
export function MentorPageView({
  displayName,
  avatarUrl,
  publicWorkUrl,
  bio,
  stackTags,
  offerReady,
  prices,
  slots,
}: MentorPageViewProps) {
  return (
    <article className="flex max-w-measure flex-col gap-section">
      <header className="flex items-center gap-paragraph">
        <MentorAvatar displayName={displayName} avatarUrl={avatarUrl} size="lg" />
        <div className="flex min-w-0 flex-col gap-related">
          <h1 className="text-heading-1 font-semibold break-words">{displayName}</h1>
          <TagList tags={stackTags} />
        </div>
      </header>

      <section aria-labelledby="done-heading" className="flex flex-col gap-related">
        <h2 id="done-heading" className="text-heading-3 font-semibold">
          What I have done
        </h2>
        <p className="text-body whitespace-pre-line">{bio}</p>
        <h3 className="mt-paragraph text-heading-4 font-semibold">Public work</h3>
        <a
          href={publicWorkUrl}
          target="_blank"
          rel="noopener nofollow ugc"
          className="relative block w-fit max-w-full truncate rounded-control font-mono text-body-small text-link underline underline-offset-4 outline-none focus-visible:focus-ring"
        >
          {publicWorkLabel(publicWorkUrl)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </section>

      <section aria-labelledby="sessions-heading" className="flex flex-col gap-paragraph">
        <h2 id="sessions-heading" className="text-heading-3 font-semibold">
          Sessions
        </h2>
        <TextSessionNotice />
        {offerReady && prices ? (
          <>
            <SessionFacts prices={prices} />
            <p className="text-caption text-muted-foreground">Times are shown in your time zone</p>
            <ul aria-label="Open times" className="flex flex-col">
              {slots.map((slot) => (
                <li
                  key={slot.id}
                  aria-disabled={slot.meetsLeadTime ? undefined : true}
                  className="flex flex-wrap items-baseline justify-between gap-related border-b border-border py-(--dm-list-row-padding-y)"
                >
                  <span className={slot.meetsLeadTime ? "text-foreground" : "text-disabled-foreground"}>
                    <LocalTime iso={slot.startsAt} />
                  </span>
                  {slot.meetsLeadTime ? null : (
                    <span className="text-caption text-muted-foreground">
                      Starts in less than two hours — no longer bookable
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body-small font-medium text-foreground">Not bookable yet</p>
        )}
      </section>
    </article>
  );
}
