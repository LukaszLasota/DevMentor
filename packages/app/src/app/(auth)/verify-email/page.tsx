import type { Metadata } from "next";
import { VerifyEmailForm } from "./VerifyEmailForm";

export const metadata: Metadata = {
  title: "Set your password · DevMentor",
  // The link token sits in the URL fragment, which browsers never send; the policy (also a response
  // header in next.config.ts) keeps the page URL out of any Referer as well.
  referrer: "no-referrer",
};

// Static shell: the token is read in the browser from `location.hash` and only ever sent in the POST body.
export default function VerifyEmailPage() {
  return <VerifyEmailForm />;
}
