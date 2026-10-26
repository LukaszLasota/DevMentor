import type { Metadata } from "next";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor",
};

// Auth pages (/sign-in; /register and /verify-email in phase 2): panel surface via @devmentor/ui.
export default function AuthRootLayout({ children }: { children: React.ReactNode }) {
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
