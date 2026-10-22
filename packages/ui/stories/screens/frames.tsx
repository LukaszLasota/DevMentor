import type { ReactNode } from "react";

// Minimal page frames for screen stories. The specs define no app shell (header, navigation), so these
// are proposals and the shell is listed on "What is missing".

function Logo() {
  return <span className="font-mono text-label font-medium tracking-tight">DevMentor</span>;
}

/** Public pages (/mentors, /m/[slug], /invitation): Tailwind only. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-paragraph py-paragraph">
          <a href="#home" className="rounded-control outline-none focus-visible:focus-ring">
            <Logo />
          </a>
          <a href="/mentors" className="rounded-control text-label text-link underline underline-offset-4 outline-none focus-visible:focus-ring">
            Find a mentor
          </a>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-paragraph py-section">{children}</div>
    </div>
  );
}

/** Signed-in panels (/mentor/*, /admin/*). */
export function PanelFrame({ area, children }: { area: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-paragraph px-paragraph py-paragraph">
          <Logo />
          <span className="text-caption text-muted-foreground">{area}</span>
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-component px-paragraph py-section">{children}</main>
    </div>
  );
}

/** Auth pages (/sign-in, /register, /verify-email). */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center gap-component bg-background px-paragraph py-section text-foreground">
      <Logo />
      <main className="w-full">{children}</main>
    </div>
  );
}
