import { AccountBar } from "@devmentor/ui";
import { getPageSession } from "@/lib/session";
import { SignOutAction } from "./SignOutAction";

/**
 * App shell header of signed-in layouts (L04): the account bar of the signed-in user, nothing
 * without a session (the page's own guard redirects). Request-time data: render inside <Suspense>.
 */
export async function AccountHeader({ area }: { area?: string }) {
  const user = await getPageSession();

  if (user === null) {
    return null;
  }

  return <AccountBar user={user} area={area} signOut={<SignOutAction />} />;
}
