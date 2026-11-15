"use client";

import { registerSchema } from "@devmentor/core/validators";
import { apiCall, CheckInboxNotice, CrudForm } from "@devmentor/ui";
import { useState } from "react";
import { MAIL_FAILED, failureMessage, withMessage } from "./messages";

const RESEND = "/api/auth/verify-email/resend";

/** Register (s03) or a new link after an invalid one (s04); both endpoints answer 202 for every email. */
const PURPOSES = {
  register: {
    endpoint: "/api/auth/register",
    submitLabel: "Send link",
    hint: "The link works for 24 hours.",
    sentTitle: "Check your inbox to finish registration",
    sentText: (email: string) => `We sent an email to ${email}. Open the link in it to set your password.`,
  },
  resend: {
    endpoint: RESEND,
    submitLabel: "Send a new link",
    hint: "Enter the email you registered with.",
    sentTitle: "Check your inbox",
    sentText: (email: string) => `If ${email} still needs a password, we sent it a new link. It works for 24 hours.`,
  },
} as const;

export interface EmailLinkRequestProps {
  purpose: keyof typeof PURPOSES;
  /** Safe path the mailed link brings the user back to (L02); the server checks it again. */
  returnTo?: string;
}

/**
 * Email field → "check your inbox" with "Send a new link" (resend) and "Use a different email", which
 * brings the form back with the address filled in. 503 shows the L06 copy, 429 the wait.
 */
export function EmailLinkRequest({ purpose, returnTo }: EmailLinkRequestProps) {
  const { endpoint, submitLabel, hint, sentTitle, sentText } = PURPOSES[purpose];
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function resend(): Promise<string | null> {
    const result = await apiCall(RESEND, { method: "POST", body: { email, returnTo } });

    return result.ok ? null : failureMessage(result.error, MAIL_FAILED);
  }

  if (sent) {
    return (
      <CheckInboxNotice title={sentTitle} onResend={resend} onUseDifferentEmail={() => setSent(false)}>
        <p>{sentText(email)}</p>
      </CheckInboxNotice>
    );
  }

  return (
    <CrudForm
      schema={registerSchema}
      fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email", description: hint }]}
      defaultValues={{ email }}
      submitLabel={submitLabel}
      submittingLabel="Sending…"
      onSubmit={async (values) => {
        setEmail(values.email);
        const result = await apiCall(endpoint, { method: "POST", body: { email: values.email, returnTo } });

        return result.ok ? result : withMessage(result, MAIL_FAILED);
      }}
      onSuccess={() => setSent(true)}
    />
  );
}
