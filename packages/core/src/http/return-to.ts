// Placeholder origin used only to parse and normalize a relative path.
const PARSE_BASE = 'http://return-to.invalid';
// Control characters (browsers drop tab/newline, turning `/\t/evil` into `//evil`) and backslashes
// (browsers treat `/\evil` like `//evil`).
const UNSAFE_CHARACTERS = /[\u0000-\u001f\u007f\\]/;
// Auth pages are never a target either: they send a signed-in user on to `returnTo`, so a nested
// `/sign-in?returnTo=/sign-in?returnTo=…` would bounce until the browser's redirect limit.
const BLOCKED_PREFIXES = ['/api/', '/_next/', '/sign-in/', '/register/', '/verify-email/'];

/**
 * Post-sign-in redirect target. Accepts only same-origin relative page paths (`/x?y#z`);
 * protocol-relative (`//x`), backslash, absolute URLs, anything under `/api/` or `/_next/` and the
 * auth pages (`/sign-in`, `/register`, `/verify-email`) return `fallback`. The accepted path is
 * returned normalized (`/a/../b` → `/b`).
 */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || UNSAFE_CHARACTERS.test(value)) {
    return fallback;
  }

  // A single leading slash with no backslash or control character cannot leave PARSE_BASE's origin.
  const url = new URL(value, PARSE_BASE);
  const path = `${url.pathname.toLowerCase()}/`;

  if (BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
