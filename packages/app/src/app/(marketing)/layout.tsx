import type { Metadata } from "next";
import "./globals.css";

// Inter and DM Mono are bundled by @devmentor/ui/theme.css (Fontsource), not loaded from a CDN.
export const metadata: Metadata = {
  title: "DevMentor",
  description: "DevMentor",
};

export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
