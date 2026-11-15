// Server-set auth cookies (`dm_session`, later `dm_oauth`) share one attribute set:
// HttpOnly, SameSite=Lax (top-level GET navigations such as the OAuth callback still send them),
// Path=/, and Secure in production (local http://localhost must keep working).

export interface AuthCookieOptions {
  maxAgeSeconds: number;
}

/** `Set-Cookie` value for an auth cookie. `value` must be cookie-safe (JWTs and base64url are). */
export function authCookie(name: string, value: string, { maxAgeSeconds }: AuthCookieOptions): string {
  const attributes = [`${name}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAgeSeconds}`];

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/** `Set-Cookie` value that deletes an auth cookie. */
export function clearAuthCookie(name: string): string {
  return authCookie(name, '', { maxAgeSeconds: 0 });
}

/** Value of cookie `name` from the request's `Cookie` header; `undefined` when absent or empty. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie') ?? '';

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');

    if (separator !== -1 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim() || undefined;
    }
  }

  return undefined;
}
