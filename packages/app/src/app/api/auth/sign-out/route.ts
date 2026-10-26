import { apiHandler, clearSessionCookie, endSession, withCookies } from '@devmentor/core/http';

// CSRF header only, never a valid session: a dead cookie is still cleared with a 200.
export const POST = apiHandler(async ({ req, cradle }) => {
  await endSession(req, cradle);

  return withCookies(null, [clearSessionCookie()]);
});
