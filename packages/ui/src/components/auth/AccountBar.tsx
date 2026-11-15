import type { ReactNode } from "react";
import { AccountAvatar } from "./AccountAvatar";

/** What the account bar shows of the signed-in user (a subset of core's `SessionUser`). */
export interface AccountBarUser {
  email: string;
  avatarUrl?: string | null;
}

export interface AccountBarProps {
  user: AccountBarUser;
  /** Name of the signed-in area next to the logo ("Admin", "Mentor"); omitted on mentee pages. */
  area?: string;
  /** The sign-out control (`SignOutButton` wired to the app's router). */
  signOut: ReactNode;
}

/**
 * App shell header of every signed-in page (DS-01; decision L04): who is signed in (email, GitHub
 * avatar when present) and "Sign out". Role links live in the shell sidebar (`SideNav` with
 * `accountNavSections`, spec #21 "App shell", 2026-11-14), so the bar stays minimal.
 */
export function AccountBar({ user, area, signOut }: AccountBarProps) {
  return (
    <header className="border-b border-border">
      <div className="flex flex-wrap items-center gap-paragraph px-paragraph py-paragraph">
        <div className="mr-auto flex items-baseline gap-paragraph">
          <span className="font-mono text-label font-medium tracking-tight">DevMentor</span>
          {area ? <span className="text-caption text-muted-foreground">{area}</span> : null}
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-paragraph">
          <span className="flex min-w-0 max-w-full items-center gap-related">
            {user.avatarUrl ? <AccountAvatar src={user.avatarUrl} /> : null}
            <span className="truncate font-mono text-body-small text-muted-foreground">{user.email}</span>
          </span>
          {signOut}
        </div>
      </div>
    </header>
  );
}
