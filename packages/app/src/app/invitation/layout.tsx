import type { Metadata } from "next";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor",
  // The URL carries the invitation token: keep it out of any Referer (also a response header, next.config.ts).
  referrer: "no-referrer",
};

// /invitation/[token]: public (a share link, outside the route groups) but session-aware — it signs
// out and accepts through the panel layer (`apiCall`, `SignOutButton`), so it loads the panel
// stylesheet like the `(auth)` pages; the panel itself (`InvitationPanel`) is Tailwind only.
export default function InvitationRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <div className="flex flex-col items-center gap-component px-paragraph py-section">
          <span className="font-mono text-label font-medium tracking-tight">DevMentor</span>
          <main className="w-full">{children}</main>
        </div>
      </body>
    </html>
  );
}
