"use client";

import { SignOutButton } from "@devmentor/ui";
import { useRouter } from "next/navigation";

/** The account bar's "Sign out", wired to the app router: after the session ends, go to /sign-in (s10). */
export function SignOutAction() {
  const router = useRouter();

  return <SignOutButton onSignedOut={() => router.replace("/sign-in")} />;
}
