import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingMessage } from "@devmentor/ui";
import { OperatorGuard } from "./OperatorGuard";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor Admin",
};

// The session is request-time data, so the guard runs inside <Suspense> (cacheComponents).
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <Suspense fallback={<LoadingMessage className="mx-auto max-w-3xl px-8" />}>
          <OperatorGuard>{children}</OperatorGuard>
        </Suspense>
      </body>
    </html>
  );
}
