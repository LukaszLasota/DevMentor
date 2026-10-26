// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the route wires so the test can check it; the behaviour is tested in core
  // (`github-sign-in.test.ts`, through the real redirectHandler).
  redirectHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  startGithubSignIn: 'startGithubSignIn',
  GITHUB_SIGN_IN_REDIRECT: 'GITHUB_SIGN_IN_REDIRECT',
}));

describe('GET /api/auth/github', () => {
  it('wires startGithubSignIn into redirectHandler with the shared GitHub options', async () => {
    const { GET } = await import('./route');

    expect(GET).toEqual({ handler: 'startGithubSignIn', options: 'GITHUB_SIGN_IN_REDIRECT' });
  });
});
