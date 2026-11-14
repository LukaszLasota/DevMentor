// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('@devmentor/core/http', () => ({
  // Expose what the routes wire; the behaviour is tested in core (`email-sign-in.test.ts`, through
  // the real apiHandler) and over HTTP in `integration/email-sign-in.test.ts`.
  apiHandler: (handler: unknown, options: unknown) => ({ handler, options }),
  registerWithEmail: 'registerWithEmail',
  resendVerificationLink: 'resendVerificationLink',
  signInWithPassword: 'signInWithPassword',
  verifyEmailAndSetPassword: 'verifyEmailAndSetPassword',
  CHECK_INBOX_RESPONSE: 'CHECK_INBOX_RESPONSE',
  VERIFY_EMAIL_RESPONSE: 'VERIFY_EMAIL_RESPONSE',
}));

// One file for the four email routes: each is a one-line `apiHandler` wiring.
describe('email auth routes', () => {
  it.each([
    ['POST /api/auth/register', () => import('./route'), 'registerWithEmail', 'CHECK_INBOX_RESPONSE'],
    ['POST /api/auth/verify-email/resend', () => import('../verify-email/resend/route'), 'resendVerificationLink', 'CHECK_INBOX_RESPONSE'],
    ['POST /api/auth/sign-in', () => import('../sign-in/route'), 'signInWithPassword', undefined],
    ['POST /api/auth/verify-email', () => import('../verify-email/route'), 'verifyEmailAndSetPassword', 'VERIFY_EMAIL_RESPONSE'],
  ])('%s wires its handler and options into apiHandler', async (_route, load, handler, options) => {
    const { POST } = await load();

    expect(POST).toEqual({ handler, options });
  });
});
