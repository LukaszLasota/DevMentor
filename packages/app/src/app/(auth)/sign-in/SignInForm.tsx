"use client";

import { signInSchema } from "@devmentor/core/validators";
import { apiCall, CrudForm } from "@devmentor/ui";
import { useRouter } from "next/navigation";
import { SIGN_IN_UNAVAILABLE, withMessage } from "@/components/auth/messages";

interface SignedIn {
  /** `safeReturnTo(returnTo, homeFor(roles))`, decided by the server. */
  redirectTo: string;
}

/**
 * Email and password form of /sign-in (s01): `POST /api/auth/sign-in` with the page's safe `returnTo`;
 * 401 "Invalid email or password.", 429 with the wait, 503; on success the app goes where the server says.
 */
export function SignInForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  return (
    <CrudForm
      schema={signInSchema}
      fields={[
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      submittingLabel="Signing in…"
      onSubmit={async ({ email, password }) => {
        const result = await apiCall<SignedIn>("/api/auth/sign-in", {
          method: "POST",
          body: { email, password, returnTo: returnTo || undefined },
        });

        return result.ok ? result : withMessage(result, SIGN_IN_UNAVAILABLE);
      }}
      onSuccess={(data) => router.replace((data as SignedIn).redirectTo)}
    />
  );
}
