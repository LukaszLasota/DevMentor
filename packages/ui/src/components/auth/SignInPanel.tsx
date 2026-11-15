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
  github_state_invalid: "GitHub sign-in took too long or was interrupted. Try again.",
  unexpected: "Sign-in did not finish. Try again.",
} as const;

export type SignInErrorCode = keyof typeof SIGN_IN_ERRORS;

export interface SignInPanelProps {
  /** Starts GitHub OAuth, e.g. "/api/auth/github?returnTo=/mentor". */
  githubHref: string;
  /** Email and password form (CrudForm) rendered below GitHub; without it the panel offers GitHub only. */
  emailForm?: ReactNode;
  /** Link to /register (rendered by the page with its router link); omitted → no "No account yet?" line. */
  registerLink?: ReactNode;
  error?: SignInErrorCode;
  /** Arrived with `?reason=session_ended`: the session expired or was signed out elsewhere (L03). */
  sessionEnded?: boolean;
  /** Seconds until the next attempt after 429 (spec #21). */
  retryAfterSeconds?: number;
}

/**
 * /sign-in (spec #21): GitHub first as the primary action, email and password as the fallback.
 * Always says how to get in without a password (no reset flow, decision L12).
 */
export function SignInPanel({ githubHref, emailForm, registerLink, error, sessionEnded, retryAfterSeconds }: SignInPanelProps) {
  return (
    <Card className="mx-auto w-full max-w-dialog">
      <CardHeader>
        <CardTitle>
          <h1>Sign in to DevMentor</h1>
        </CardTitle>
        <CardDescription>{emailForm ? "Use GitHub, or your email and password." : "Use your GitHub account."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-paragraph">
        {sessionEnded ? (
          <Alert tone="warning">
            <AlertDescription>Your session ended. Sign in again.</AlertDescription>
          </Alert>
        ) : null}
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
        {emailForm ? (
          <>
            <div className="flex items-center gap-related text-caption text-muted-foreground" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              or with email
              <span className="h-px flex-1 bg-border" />
            </div>
            {emailForm}
          </>
        ) : null}
        <p className="text-body-small text-muted-foreground">Forgot your password? Use GitHub with the same email.</p>
        {registerLink ? <p className="text-body-small text-muted-foreground">No account yet? {registerLink}</p> : null}
      </CardContent>
    </Card>
  );
}
