import { withScope } from "@devmentor/core";
import type { InvitationState } from "@devmentor/ui/mentors";
import { getPageSession } from "@/lib/session";
import { InvitationActions } from "./InvitationActions";

const MENTOR_HOME = "/mentor";

/**
 * The invitation page's state (spec #22 UI/UX, s08), decided on the server:
 * - the viewer already holds `mentor` → "You are already a mentor." with a link to /mentor (L07;
 *   from the viewer's roles, so a used link reloaded by its mentor does not read as invalid, and
 *   nothing about the token is revealed);
 * - an invalid token (malformed, unknown, expired, revoked, used) → one sentence, no form;
 * - signed out → the invited address and tags, sign in first and come back here (L11);
 * - signed in with the invited, verified email → Accept; any other account → both addresses and
 *   Sign out, no Accept (the accept route refuses it with 403 as well).
 */
export async function invitationState(token: string): Promise<InvitationState> {
  const viewer = await getPageSession();

  if (viewer?.roles.includes("mentor")) {
    return { kind: "already-mentor", mentorHref: MENTOR_HOME };
  }

  const invitation = await withScope(({ invitationService }) => invitationService.find(token));

  if (invitation === null) {
    return { kind: "invalid" };
  }

  const { email, stackTags: tags } = invitation;

  if (viewer === null) {
    const returnTo = new URLSearchParams({ returnTo: `/invitation/${token}` }).toString();

    return { kind: "signed-out", email, tags, githubHref: `/api/auth/github?${returnTo}`, emailHref: `/sign-in?${returnTo}` };
  }

  // Invitation emails are stored normalized (trim, lower-case); account emails too, compared the same way.
  if (viewer.emailVerified && viewer.email.trim().toLowerCase() === email) {
    return { kind: "match", email, tags, accountEmail: viewer.email };
  }

  return { kind: "mismatch", email, accountEmail: viewer.email };
}

export async function InvitationContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <InvitationActions token={token} state={await invitationState(token)} />;
}
