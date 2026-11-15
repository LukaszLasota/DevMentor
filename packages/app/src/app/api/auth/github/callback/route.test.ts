// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the route wires so the test can check it; the behaviour (state checked before any
  // outbound call, error codes, cookies, returnTo) is tested in core (`github-sign-in.test.ts`).
  redirectHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  completeGithubSignIn: 'completeGithubSignIn',
  GITHUB_SIGN_IN_REDIRECT: 'GITHUB_SIGN_IN_REDIRECT',
}));

describe('GET /api/auth/github/callback', () => {
  it('wires completeGithubSignIn into redirectHandler with the shared GitHub options', async () => {
    const { GET } = await import('./route');

    expect(GET).toEqual({ handler: 'completeGithubSignIn', options: 'GITHUB_SIGN_IN_REDIRECT' });
  });
});
