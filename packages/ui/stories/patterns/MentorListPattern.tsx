import { ErrorMessage } from "../../src";
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
            <p className="text-body-small">
              No {stackTagLabel(state.tag)} mentors have open times right now.{" "}
              <a href="/mentors" className="rounded-control text-link underline underline-offset-4 outline-none focus-visible:focus-ring">
                Show all mentors
              </a>
            </p>
          ) : (
            <p className="text-body-small">No mentors have open times right now. Check back soon.</p>
          )}
        </>
      ) : null}
    </main>
  );
}
