import type { Metadata } from "next";
import "@devmentor/ui/styles.css";

export const metadata: Metadata = {
  title: "DevMentor Admin",
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
