import type { Metadata } from "next";
import { Suspense } from "react";
import { AppShell } from "@devmentor/ui";
import { AccountHeader } from "@/components/account/AccountHeader";
import { AccountNav } from "@/components/account/AccountNav";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor",
};

// Mentee pages (/mentors; favorites and sessions later): panel surface via @devmentor/ui. No layout
// guard — the group has several paths and a layout cannot know which one is open, so every page
// calls `requirePageSession(<its path>)`; the account bar and the sidebar render only with a session.
export default function MenteeRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <AppShell
          header={
            <Suspense fallback={null}>
              <AccountHeader />
            </Suspense>
          }
          nav={
            <Suspense fallback={null}>
              <AccountNav />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
