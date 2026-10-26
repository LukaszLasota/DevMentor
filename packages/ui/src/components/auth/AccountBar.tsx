import type { ReactNode } from "react";
import { TextLink } from "../../backend/navigation/TextLink";

/** Roles of a DevMentor account; mirrors `Role` of `@devmentor/core` (ui never imports core). */
export type AccountRole = "mentee" | "mentor" | "operator";

/** What the account bar shows of the signed-in user (a subset of core's `SessionUser`). */
export interface AccountBarUser {
  email: string;
  roles: readonly AccountRole[];
  avatarUrl?: string | null;
}

export interface AccountBarProps {
  user: AccountBarUser;
  /** Name of the signed-in area next to the logo ("Admin", "Mentor"); omitted on mentee pages. */
  area?: string;
  /** The sign-out control (`SignOutButton` wired to the app's router). */
  signOut: ReactNode;
}

/** Role homes linked from the bar, in display order (L09). */
const ROLE_LINKS: readonly { role: AccountRole; href: string; label: string }[] = [
  { role: "mentor", href: "/mentor", label: "Mentor" },
  { role: "operator", href: "/admin", label: "Admin" },
];

/**
 * App shell header of every signed-in page (DS-01; decisions L04, L09): who is signed in (email,
 * GitHub avatar when present), a link to each role home the user holds and "Sign out". Role homes
 * live in different root layouts, so plain links (a full page load) are the right navigation.
 */
export function AccountBar({ user, area, signOut }: AccountBarProps) {
  const links = ROLE_LINKS.filter(({ role }) => user.roles.includes(role));

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-paragraph px-paragraph py-paragraph">
        <div className="mr-auto flex items-baseline gap-paragraph">
          <span className="font-mono text-label font-medium tracking-tight">DevMentor</span>
          {area ? <span className="text-caption text-muted-foreground">{area}</span> : null}
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-paragraph">
          <span className="flex min-w-0 max-w-full items-center gap-related">
            {user.avatarUrl ? (
              // Spec #21: a plain <img> straight from GitHub; decorative, the email next to it names the account.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-avatar-sm shrink-0 rounded-full object-cover"
              />
            ) : null}
            <span className="truncate font-mono text-body-small text-muted-foreground">{user.email}</span>
          </span>
          {links.length > 0 ? (
            <nav aria-label="Your areas" className="flex items-center gap-paragraph">
              {links.map(({ href, label }) => (
                <TextLink key={href} href={href}>
                  {label}
                </TextLink>
              ))}
            </nav>
          ) : null}
          {signOut}
        </div>
      </div>
    </header>
  );
}
