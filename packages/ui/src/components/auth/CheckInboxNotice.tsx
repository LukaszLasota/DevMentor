"use client";

import { useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";

export interface CheckInboxNoticeProps {
  /** E.g. "Check your inbox to finish registration" (s03). */
  title: string;
  /** What was sent and where; the page words it so it never reveals whether an account exists. */
  children: ReactNode;
  /** Sends the link again (`POST /api/auth/verify-email/resend`); resolves to `null` when sent, else the message to show. */
  onResend: () => Promise<string | null>;
  /** Returns to the email form with the address filled in, ready to correct (prototype review, 2026-10-26). */
  onUseDifferentEmail: () => void;
}

type ResendState = { status: "idle" } | { status: "sending" } | { status: "sent" } | { status: "failed"; message: string };

/**
 * "Check your inbox" after an email link was requested (s03, s04): "Send a new link" (the label the
 * "someone tried to register" mail names) and "Use a different email". Inside a status region, so the
 * result of a resend is announced.
 */
export function CheckInboxNotice({ title, children, onResend, onUseDifferentEmail }: CheckInboxNoticeProps) {
  const [resend, setResend] = useState<ResendState>({ status: "idle" });

  async function sendAgain() {
    setResend({ status: "sending" });
    const message = await onResend();
    setResend(message === null ? { status: "sent" } : { status: "failed", message });
  }

  return (
    <Alert tone="success">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <div className="grid gap-related">{children}</div>
        {resend.status === "sent" ? <p>We sent a new link.</p> : null}
        {resend.status === "failed" ? <p className="text-caption text-destructive">{resend.message}</p> : null}
        <div className="flex flex-wrap gap-related">
          <Button size="sm" loading={resend.status === "sending"} loadingLabel="Sending…" onClick={() => void sendAgain()}>
            Send a new link
          </Button>
          <Button size="sm" appearance="text" intent="primary" onClick={onUseDifferentEmail}>
            Use a different email
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
