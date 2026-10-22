import { EmptyState, ErrorMessage, TextLink } from "../../src";
import {
  MentorCard,
  MentorListSkeleton,
  MentorTagFilter,
  stackTagLabel,
  type MentorCardProps,
  type StackTagKey,
} from "../../src/mentors";

export type MentorListState =
  | { kind: "loading" }
  | { kind: "results"; tag: StackTagKey | null; items: MentorCardProps[] }
  | { kind: "unknown-tag" }
  | { kind: "error" };

/** The list-with-filters pattern on /mentors (spec #27), every state from one component. */
export function MentorListPattern({ state }: { state: MentorListState }) {
  return (
    <main className="flex max-w-measure flex-col gap-component">
      <header className="flex flex-col gap-related">
        <h1 className="text-heading-1 font-semibold">Find a mentor</h1>
        <p className="text-body-small text-muted-foreground">Mentors who most recently published open times come first.</p>
      </header>
      {state.kind === "loading" ? <MentorListSkeleton /> : null}
      {state.kind === "unknown-tag" ? (
        <>
          <MentorTagFilter active={null} />
          <p className="text-body-small font-medium">Unknown stack tag.</p>
        </>
      ) : null}
      {state.kind === "error" ? (
        <>
          <MentorTagFilter active={null} />
          <ErrorMessage title="Could not load mentors" message="Try again in a minute." onRetry={() => undefined} />
        </>
      ) : null}
      {state.kind === "results" ? (
        <>
          <MentorTagFilter active={state.tag} />
          {state.items.length > 0 ? (
            <ul>
              {state.items.map((item) => (
                <li key={item.slug}>
                  <MentorCard {...item} />
                </li>
              ))}
            </ul>
          ) : state.tag ? (
            <EmptyState
              title={`No ${stackTagLabel(state.tag)} mentors have open times right now.`}
              action={<TextLink href="/mentors">Show all mentors</TextLink>}
            />
          ) : (
            <EmptyState title="No mentors have open times right now. Check back soon." />
          )}
        </>
      ) : null}
    </main>
  );
}
