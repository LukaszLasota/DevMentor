"use client";

import { apiCall, SignOutButton } from "@devmentor/ui";
import { InvitationPanel, type InvitationState } from "@devmentor/ui/mentors";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Accepted {
  redirect: string;
}

/**
 * The interactive part of /invitation/[token]: "Accept invitation" posts to the accept route
 * (`apiCall`: CSRF header) and goes to `/mentor` with the re-issued session; a failure stays under
 * the button with "Try again" and changes nothing (L07). A second tab that lost the race gets 409
 * `ALREADY_MENTOR` and shows "You are already a mentor." Sign out (other account) ends the session
 * and re-renders this page signed out, so the invited address can sign in from here.
 */
export function InvitationActions({ token, state }: { token: string; state: InvitationState }) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [alreadyMentor, setAlreadyMentor] = useState(false);

  async function accept() {
    setAccepting(true);
    setAcceptError(null);
    const result = await apiCall<Accepted>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" });

    if (result.ok) {
      // Stays busy until the navigation replaces the page.
      router.replace(result.data.redirect);
      return;
    }

    if (result.error.code === "ALREADY_MENTOR") {
      setAlreadyMentor(true);
    } else {
      setAcceptError(result.error.message);
    }

    setAccepting(false);
  }

  return (
    <InvitationPanel
      state={alreadyMentor ? { kind: "already-mentor", mentorHref: "/mentor" } : state}
      onAccept={() => void accept()}
      accepting={accepting}
      acceptError={acceptError}
      signOut={<SignOutButton onSignedOut={() => router.refresh()} />}
    />
  );
}
