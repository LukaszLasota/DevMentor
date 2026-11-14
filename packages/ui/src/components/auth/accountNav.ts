import type { SideNavSection } from "../../backend/shell/SideNav";

/** Roles of a DevMentor account; mirrors `Role` of `@devmentor/core` (ui never imports core). */
export type AccountRole = "mentee" | "mentor" | "operator";

/** Accessible name of the app shell sidebar. */
export const ACCOUNT_NAV_LABEL = "Main";

/**
 * Sidebar links of the signed-in shell by role (spec #21 "App shell", L04, L09). Only pages that
 * exist are linked; new items arrive with their pages ("Users", "My sessions").
 */
export function accountNavSections(roles: readonly AccountRole[]): SideNavSection[] {
  const sections: SideNavSection[] = [
    {
      items: [
        { href: "/mentors", label: "Mentors" },
        ...(roles.includes("mentor") ? [{ href: "/mentor", label: "Mentor workspace" }] : []),
      ],
    },
  ];

  if (roles.includes("operator")) {
    sections.push({ label: "Admin", items: [{ href: "/admin", label: "Dashboard" }] });
  }

  return sections;
}
