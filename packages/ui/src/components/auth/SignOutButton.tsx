"use client";

import { useState } from "react";
import { apiCall } from "../../backend/api/apiCall";
import { ErrorMessage } from "../../backend/feedback/ErrorMessage";
import { Button } from "../ui/button";

export interface SignOutButtonProps {
  /** Called after the server ended the session; the app navigates to `/sign-in` here. */
  onSignedOut: () => void;
}

/**
 * "Sign out" of the account bar (s10, L04): `POST /api/auth/sign-out` through `apiCall` (CSRF
 * header), which ends the session on every device. The button stays busy until the app has
 * navigated away; a failure is shown under the bar and the button can be pressed again.
 */
export function SignOutButton({ onSignedOut }: SignOutButtonProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signOut() {
    setIsPending(true);
    setError(null);
    const result = await apiCall<null>("/api/auth/sign-out", { method: "POST" });

    if (result.ok) {
      onSignedOut();
      return;
    }

    setError(result.error.message);
    setIsPending(false);
  }

  return (
    <>
      <Button size="sm" loading={isPending} loadingLabel="Signing out…" onClick={() => void signOut()}>
        Sign out
      </Button>
      {error ? <ErrorMessage className="basis-full" title="Sign-out did not finish" message={error} /> : null}
    </>
  );
}
