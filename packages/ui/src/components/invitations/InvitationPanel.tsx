import type { ReactNode } from "react";
import { cn } from "cn";
import { buttonVariants } from "../ui/button-variants";
import { TagList } from "../mentors/TagList";
import type { StackTagKey } from "../mentors/vocabulary";

export type InvitationState =
  | { kind: "signed-out"; email: string; tags: readonly StackTagKey[]; githubHref: string; emailHref: string }
  | { kind: "match"; email: string; tags: readonly StackTagKey[]; accountEmail: string }
  | { kind: "mismatch"; email: string; accountEmail: string }
  | { kind: "already-mentor"; mentorHref: string }
  | { kind: "invalid" };

export interface InvitationPanelProps {
  state: InvitationState;
  /** `match`: "Accept invitation" (and "Try again" after an error). Without it the button is inert. */
  onAccept?: () => void;
  /** `match`: the accept request is in flight; the button is busy ("Accepting…"). */
  accepting?: boolean;
  /** `match`: why the last accept failed; shown under the button with "Try again" (L07). Nothing changed. */
  acceptError?: string | null;
  /** `mismatch`: the sign-out control (the app wires the session action, e.g. `SignOutButton`). */
  signOut?: ReactNode;
}

/**
 * /invitation/[token] (spec #22, screen s08). Tailwind only: styled native links and buttons with
 * buttonVariants, no Radix, so the panel fits a public page; the interactive parts (accept handler,
 * sign-out control) come from the app. Accept appears only for the invited, verified account.
 */
export function InvitationPanel({ state, onAccept, accepting = false, acceptError = null, signOut }: InvitationPanelProps) {
  const panel = "mx-auto flex w-full max-w-dialog flex-col gap-paragraph rounded-card border border-border p-panel";

  if (state.kind === "invalid") {
    return (
      <section className={panel}>
        <h1 className="text-heading-3 font-semibold">This invitation is not valid</h1>
        {/* Spec #22 asks for one sentence and no form; the wording is ours, approved 2026-10-22. */}
        <p className="text-body-small text-muted-foreground">
          It may have expired, been used or been revoked. Ask the person who invited you for a new link.
        </p>
      </section>
    );
  }

  if (state.kind === "already-mentor") {
    // L07: accepted already (another tab, a reload): no second acceptance, a way on instead.
    return (
      <section className={panel}>
        <h1 className="text-heading-3 font-semibold">You are already a mentor.</h1>
        <a
          href={state.mentorHref}
          className="self-start rounded-control text-label text-link underline underline-offset-4 outline-none focus-visible:focus-ring"
        >
          Go to your mentor page
        </a>
      </section>
    );
  }

  return (
    <section className={panel}>
      <h1 className="text-heading-3 font-semibold">You are invited to mentor on DevMentor</h1>
      <p className="text-body-small">
        Invitation for <span className="font-mono">{state.email}</span>
      </p>
      {"tags" in state ? <TagList tags={state.tags} /> : null}

      {state.kind === "signed-out" ? (
        <div className="flex flex-col gap-related">
          {/* L11: sign in first (back to this page), then accept. */}
          <a href={state.githubHref} className={cn(buttonVariants({ intent: "primary", appearance: "filled", size: "lg" }))}>
            Sign in with GitHub
          </a>
          <a href={state.emailHref} className={cn(buttonVariants({ size: "lg" }))}>
            Sign in with email
          </a>
        </div>
      ) : null}

      {state.kind === "match" ? (
        <div className="flex flex-col gap-related">
          <p className="text-body-small text-muted-foreground">
            The mentor role goes to <span className="font-mono text-foreground">{state.accountEmail}</span>.
          </p>
          <button
            type="button"
            onClick={onAccept}
            disabled={accepting}
            aria-busy={accepting || undefined}
            className={cn(buttonVariants({ intent: "primary", appearance: "filled", size: "lg" }))}
          >
            {accepting ? "Accepting…" : "Accept invitation"}
          </button>
          {acceptError && !accepting ? (
            <div className="flex flex-wrap items-center gap-related">
              <p role="alert" className="text-caption text-destructive">
                {acceptError} Nothing changed.
              </p>
              <button type="button" onClick={onAccept} className={cn(buttonVariants({ size: "sm" }))}>
                Try again
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.kind === "mismatch" ? (
        <div className="flex flex-wrap items-center gap-related">
          <p className="basis-full text-body-small">
            You are signed in as <span className="font-mono">{state.accountEmail}</span>. Sign out, then sign in with{" "}
            <span className="font-mono">{state.email}</span> to accept.
          </p>
          {signOut}
        </div>
      ) : null}
    </section>
  );
}
