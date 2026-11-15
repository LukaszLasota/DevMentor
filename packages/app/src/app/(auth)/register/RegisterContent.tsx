import { homeFor } from "@devmentor/core";
import { safeReturnTo } from "@devmentor/core/http";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, TextLink } from "@devmentor/ui";
import { redirect } from "next/navigation";
import { EmailLinkRequest } from "@/components/auth/EmailLinkRequest";
import { single, withReturnTo } from "@/lib/auth-links";
import { getPageSession } from "@/lib/session";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /register body (s03): email only; the mailed link sets the password and carries the safe `returnTo`
 * (L02). A signed-in user goes on to `returnTo` or home, like /sign-in.
 */
export async function RegisterContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(single(query.returnTo), "");
  const user = await getPageSession();

  if (user !== null) {
    redirect(returnTo || homeFor(user.roles));
  }

  return (
    <Card className="mx-auto w-full max-w-dialog">
      <CardHeader>
        <CardTitle>
          <h1>Create an account</h1>
        </CardTitle>
        <CardDescription>Register with your email. We send you a link to set your password.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-paragraph">
        <EmailLinkRequest purpose="register" returnTo={returnTo || undefined} />
        <p className="text-body-small text-muted-foreground">
          Already have an account, or use GitHub? <TextLink href={withReturnTo("/sign-in", returnTo)}>Sign in</TextLink>
        </p>
      </CardContent>
    </Card>
  );
}
