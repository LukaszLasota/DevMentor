import type { ApiFailure } from "@devmentor/ui";

/** Mail provider failed on register or resend (decision L06). */
export const MAIL_FAILED = "We could not send the email. Try again later, or continue with GitHub.";
/** 503 on password sign-in: hashing gate saturated or the server is not configured. */
export const SIGN_IN_UNAVAILABLE = "Sign-in is not available right now. Try again later, or continue with GitHub.";
/** 503 on setting the password: the link is not used up, so trying again works. */
export const SET_PASSWORD_UNAVAILABLE = "We could not set your password right now. Try again in a minute.";
/** Error code of a used, expired, superseded or foreign verification link (`POST /api/auth/verify-email`). */
export const VERIFICATION_LINK_INVALID = "VERIFICATION_LINK_INVALID";

/** 429 copy with the wait from `retryAfterSeconds`, rounded up to whole minutes. */
export function tooManyAttempts(retryAfterSeconds: number | undefined): string {
  if (retryAfterSeconds === undefined) {
    return "Too many attempts. Try again later.";
  }

  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));

  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/**
 * The message a form shows for a failed auth call: 429 with the wait, 503 with the page's own copy,
 * anything else (401 "Invalid email or password.", validation, network) as the server or `apiCall` worded it.
 */
export function failureMessage(error: ApiFailure["error"], unavailable: string): string {
  switch (error.code) {
    case "TOO_MANY_REQUESTS":
      return tooManyAttempts(error.retryAfterSeconds);
    case "SERVICE_UNAVAILABLE":
      return unavailable;
    default:
      return error.message;
  }
}

/** `failureMessage` applied to an `ApiFailure`, keeping its code and field errors for `CrudForm`. */
export function withMessage(failure: ApiFailure, unavailable: string): ApiFailure {
  return { ok: false, error: { ...failure.error, message: failureMessage(failure.error, unavailable) } };
}
