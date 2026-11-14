"use client";

import { setPasswordSchema } from "@devmentor/core/validators";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  apiCall,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CrudForm,
  LoadingMessage,
  TextLink,
} from "@devmentor/ui";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { EmailLinkRequest } from "@/components/auth/EmailLinkRequest";
import { SET_PASSWORD_UNAVAILABLE, VERIFICATION_LINK_INVALID, withMessage } from "@/components/auth/messages";

const passwordSchema = setPasswordSchema.pick({ password: true });

interface LinkFragment {
  /** `undefined` when the fragment has no well-formed token: the link is shown as not working. */
  token: string | undefined;
  returnTo: string | undefined;
}

interface EmailVerified {
  redirectTo: string;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** `#token=…&returnTo=…` as mailed (`verificationLink` in core); `null` while rendering on the server. */
function useLinkFragment(): LinkFragment | null {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => null);

  if (hash === null) {
    return null;
  }

  const params = new URLSearchParams(hash.slice(1));
  const token = setPasswordSchema.shape.token.safeParse(params.get("token"));

  return { token: token.success ? token.data : undefined, returnTo: params.get("returnTo") ?? undefined };
}

/** Expired, used, superseded or someone else's link (L13): changes nothing, offers a new link. */
function LinkInvalid({ returnTo }: { returnTo: string | undefined }) {
  return (
    <>
      <Alert tone="danger">
        <AlertTitle>This link does not work any more</AlertTitle>
        <AlertDescription>
          <p>It may have expired or been used already. A link also does not work while you are signed in to another account.</p>
        </AlertDescription>
      </Alert>
      <EmailLinkRequest purpose="resend" returnTo={returnTo} />
    </>
  );
}

/**
 * /verify-email (s04): one password field with "Show password" (L05); `POST /api/auth/verify-email`
 * with the token and `returnTo` from the fragment signs the user in and goes to `redirectTo` (L02).
 */
export function VerifyEmailForm() {
  const router = useRouter();
  const link = useLinkFragment();
  const [invalid, setInvalid] = useState(false);

  return (
    <Card className="mx-auto w-full max-w-dialog">
      <CardHeader>
        <CardTitle>
          <h1>Set your password</h1>
        </CardTitle>
        <CardDescription>Choose a password to finish your registration. You are signed in right after.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-paragraph">
        {link === null ? (
          <LoadingMessage />
        ) : invalid || link.token === undefined ? (
          <LinkInvalid returnTo={link.returnTo} />
        ) : (
          <CrudForm
            schema={passwordSchema}
            fields={[
              {
                name: "password",
                label: "New password",
                type: "password",
                revealable: true,
                autoComplete: "new-password",
                description: "12 to 128 characters.",
              },
            ]}
            submitLabel="Set password and sign in"
            submittingLabel="Setting password…"
            onSubmit={async ({ password }) => {
              const result = await apiCall<EmailVerified>("/api/auth/verify-email", {
                method: "POST",
                body: { token: link.token, password, returnTo: link.returnTo },
              });

              if (!result.ok && result.error.code === VERIFICATION_LINK_INVALID) {
                setInvalid(true);
              }

              return result.ok ? result : withMessage(result, SET_PASSWORD_UNAVAILABLE);
            }}
            onSuccess={(data) => router.replace((data as EmailVerified).redirectTo)}
          />
        )}
        <p className="text-body-small text-muted-foreground">
          No password wanted? <TextLink href="/sign-in">Continue with GitHub</TextLink> using the same email.
        </p>
      </CardContent>
    </Card>
  );
}
