import { accountNavSections } from "@devmentor/ui";
import { getPageSession } from "@/lib/session";
import { ShellNav } from "./ShellNav";

/**
 * App shell sidebar of signed-in layouts (spec #21 "App shell"): links by the user's roles, nothing
 * without a session (the page's own guard redirects). Request-time data: render inside <Suspense>.
 */
export async function AccountNav() {
  const user = await getPageSession();

  if (user === null) {
    return null;
  }

  return <ShellNav sections={accountNavSections(user.roles)} />;
}
