import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

/** `?error=` codes from spec #21 (platform primitives). The spec gives no copy; this copy was approved 2026-10-22. */
export const SIGN_IN_ERRORS = {
  github_unavailable: "GitHub sign-in is not available right now. Use your email and password, or try again later.",
  github_cancelled: "You cancelled GitHub sign-in. Continue with GitHub again, or use your email.",
  github_account_conflict: "This GitHub account is linked to another DevMentor account. Sign in with the email you used before.",
  github_email_unverified: "Your GitHub email is not verified. Verify it on GitHub, or use your email and password.",
  unexpected: "Sign-in did not finish. Try again.",
} as const;

export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

export interface SignInPanelProps {
  /** Starts GitHub OAuth, e.g. "/api/auth/github?returnTo=/mentor". */
  githubHref: string;
  /** Email and password form (CrudForm) rendered below GitHub. */
  emailForm: ReactNode;
  /** Link to /register (rendered by the page with its router link). */
  registerLink: ReactNode;
  error?: SignInErrorCode;
  /** Seconds until the next attempt after 429 (spec #21). */
  retryAfterSeconds?: number;
}

/** /sign-in (spec #21): GitHub first as the primary action, email and password as the fallback. */
export function SignInPanel({ githubHref, emailForm, registerLink, error, retryAfterSeconds }: SignInPanelProps) {
  return (
    <Card className="mx-auto w-full max-w-dialog">
      <CardHeader>
        <CardTitle>
          <h1>Sign in to DevMentor</h1>
        </CardTitle>
        <CardDescription>Use GitHub, or your email and password.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-paragraph">
        {error ? (
          <Alert tone="danger">
            <AlertDescription>{SIGN_IN_ERRORS[error]}</AlertDescription>
          </Alert>
        ) : null}
        {retryAfterSeconds ? (
          <Alert tone="warning">
            <AlertTitle>Too many attempts</AlertTitle>
            <AlertDescription>Try again in {Math.ceil(retryAfterSeconds / 60)} min.</AlertDescription>
          </Alert>
        ) : null}
        <Button asChild intent="primary" appearance="filled" size="lg">
          <a href={githubHref}>
            Continue with GitHub
          </a>
        </Button>
        <div className="flex items-center gap-related text-caption text-muted-foreground" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          or with email
          <span className="h-px flex-1 bg-border" />
        </div>
        {emailForm}
        <p className="text-body-small text-muted-foreground">No account yet? {registerLink}</p>
      </CardContent>
    </Card>
  );
}
