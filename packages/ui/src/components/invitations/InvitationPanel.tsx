import { cn } from "cn";
import { buttonVariants } from "../ui/button-variants";
import { TagList } from "../mentors/TagList";
import type { StackTagKey } from "../mentors/vocabulary";

export type InvitationState =
  | { kind: "signed-out"; email: string; tags: StackTagKey[]; githubHref: string; emailHref: string }
  | { kind: "match"; email: string; tags: StackTagKey[]; accountEmail: string }
  | { kind: "mismatch"; email: string; accountEmail: string; signOutHref: string }
  | { kind: "invalid" };

/**
 * /invitation/[token] (spec #22). Public page, Tailwind only: buttons are styled links/buttons with
 * buttonVariants, no Radix. Accept appears only for the invited, verified account.
 */
export function InvitationPanel({ state, acceptAction }: { state: InvitationState; acceptAction?: string }) {
  const panel = "mx-auto flex w-full max-w-dialog flex-col gap-paragraph rounded-card border border-border p-panel";

  if (state.kind === "invalid") {
    return (
      <section className={panel}>
        <h1 className="text-heading-3 font-semibold">This invitation is not valid</h1>
        {/* Spec #22 asks for one sentence and no form; the wording is a proposal. */}
        <p className="text-body-small text-muted-foreground">
          It may have expired, been used or been revoked. Ask the person who invited you for a new link.
        </p>
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
          <a href={state.githubHref} className={cn(buttonVariants({ intent: "primary", appearance: "filled", size: "lg" }))}>
            Sign in with GitHub
          </a>
          <a href={state.emailHref} className={cn(buttonVariants({ size: "lg" }))}>
            Sign in with email
          </a>
        </div>
      ) : null}

      {state.kind === "match" ? (
        <form method="post" action={acceptAction} className="flex flex-col gap-related">
          <p className="text-body-small text-muted-foreground">
            The mentor role goes to <span className="font-mono text-foreground">{state.accountEmail}</span>.
          </p>
          <button type="submit" className={cn(buttonVariants({ intent: "primary", appearance: "filled", size: "lg" }))}>
            Accept invitation
          </button>
        </form>
      ) : null}

      {state.kind === "mismatch" ? (
        <div className="flex flex-col gap-related">
          <p className="text-body-small">
            You are signed in as <span className="font-mono">{state.accountEmail}</span>. Sign out, then sign in with{" "}
            <span className="font-mono">{state.email}</span> to accept.
          </p>
          <a href={state.signOutHref} className={cn(buttonVariants({ size: "md" }), "self-start")}>
            Sign out
          </a>
        </div>
      ) : null}
    </section>
  );
}
