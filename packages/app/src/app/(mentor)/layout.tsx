import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell, LoadingMessage } from "@devmentor/ui";
import { AccountHeader } from "@/components/account/AccountHeader";
import { AccountNav } from "@/components/account/AccountNav";
import { MentorGuard } from "./MentorGuard";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor",
};

// Mentor pages (/mentor; profile, prices, slots later): panel surface via @devmentor/ui. The session
// is request-time data, so the guard runs inside <Suspense> (cacheComponents); the account bar and
// the sidebar sit behind it, so nothing of the user's renders before the mentor check.
export default function MentorRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <Suspense fallback={<LoadingMessage className="mx-auto max-w-5xl px-paragraph py-section" />}>
          <MentorGuard>
            <AppShell header={<AccountHeader area="Mentor" />} nav={<AccountNav />}>
              {children}
            </AppShell>
          </MentorGuard>
        </Suspense>
      </body>
    </html>
  );
}
