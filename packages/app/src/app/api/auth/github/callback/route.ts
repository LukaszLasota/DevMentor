import { completeGithubSignIn, GITHUB_SIGN_IN_REDIRECT, redirectHandler } from '@devmentor/core/http';

// GitHub redirects the browser here; failures land on /sign-in?error=<code>.
export const GET = redirectHandler(completeGithubSignIn, GITHUB_SIGN_IN_REDIRECT);
