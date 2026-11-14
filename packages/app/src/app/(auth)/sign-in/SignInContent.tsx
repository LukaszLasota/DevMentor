import { homeFor } from "@devmentor/core";
import { safeReturnTo } from "@devmentor/core/http";
import { SIGN_IN_ERRORS, SignInPanel, TextLink, type SignInErrorCode } from "@devmentor/ui";
import { redirect } from "next/navigation";
import { single, withReturnTo } from "@/lib/auth-links";
import { getPageSession, SESSION_ENDED_REASON } from "@/lib/session";
import { SignInForm } from "./SignInForm";

type SearchParams = Record<string, string | string[] | undefined>;

const GITHUB_START = "/api/auth/github";

/** Known `?error=` codes as they are; any other value still tells the user sign-in did not finish. */
function errorCode(value: string | undefined): SignInErrorCode | undefined {
  if (value === undefined) {
    return undefined;
  }

  return Object.hasOwn(SIGN_IN_ERRORS, value) ? (value as SignInErrorCode) : "unexpected";
}

/**
 * GitHub start link with the safe `returnTo` and an optional `login` hint (GitHub prefills the
 * account; the local GitHub stub picks a persona from it). The start route validates the hint.
 */
function githubStartHref(returnTo: string, login: string | undefined): string {
  const params = new URLSearchParams();

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  if (login) {
    params.set("login", login);
  }

  const query = params.toString();

  return query ? `${GITHUB_START}?${query}` : GITHUB_START;
}

/** /sign-in body: a signed-in user goes on to `returnTo` (or home); everyone else gets the panel. */
export async function SignInContent({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  // "" = no safe returnTo: the GitHub callback then falls back to homeFor(roles).
  const returnTo = safeReturnTo(single(query.returnTo), "");
  const user = await getPageSession();

  if (user !== null) {
    redirect(returnTo || homeFor(user.roles));
  }

  const githubHref = githubStartHref(returnTo, single(query.login));

  return (
    <SignInPanel
      githubHref={githubHref}
      error={errorCode(single(query.error))}
      sessionEnded={single(query.reason) === SESSION_ENDED_REASON}
      emailForm={<SignInForm returnTo={returnTo} />}
      registerLink={<TextLink href={withReturnTo("/register", returnTo)}>Create an account</TextLink>}
    />
  );
}
