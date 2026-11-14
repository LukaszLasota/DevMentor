"use client";

import { ACCOUNT_NAV_LABEL, SideNav, type SideNavSection } from "@devmentor/ui";
import { usePathname } from "next/navigation";

/**
 * The shell sidebar with its current item. Server layouts do not know the pathname, so only this
 * check runs on the client; the links come from the server (`AccountNav`), already filtered by role.
 */
export function ShellNav({ sections }: { sections: SideNavSection[] }) {
  return <SideNav label={ACCOUNT_NAV_LABEL} sections={sections} currentPath={usePathname()} />;
}
