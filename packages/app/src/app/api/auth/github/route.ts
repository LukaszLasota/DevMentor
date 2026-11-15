import { GITHUB_SIGN_IN_REDIRECT, redirectHandler, startGithubSignIn } from '@devmentor/core/http';

// Top-level browser navigation from "Continue with GitHub": no envelope, no CSRF header.
export const GET = redirectHandler(startGithubSignIn, GITHUB_SIGN_IN_REDIRECT);
