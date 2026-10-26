import { withScope } from '../container/container';
import { logger } from '../logger';
import { cookieHeaders, toAppError, type HandlerArgs, type RouteParams } from './apiHandler';
import { safeReturnTo } from './return-to';

/** In-app redirect: `location` always passes `safeReturnTo` (fallback `/`). */
export interface InternalRedirect {
  location: string;
  cookies?: readonly string[];
}

/**
 * Redirect to another origin (e.g. GitHub's authorize URL). Only a `URL` built by server code from
 * configuration may go here — never a value taken from the request.
 */
export interface ExternalRedirect {
  externalLocation: URL;
  cookies?: readonly string[];
}

export type RedirectResult = InternalRedirect | ExternalRedirect;

export interface RedirectHandlerOptions {
  /** Page that receives failures as `?error=<code>`, e.g. `/sign-in`. */
  errorRedirect: string;
  /**
   * Maps `AppError.code` to the `error` query value. Unmapped codes are lower-cased
   * (`GITHUB_ACCOUNT_CONFLICT` → `github_account_conflict`), so a service picks the page's code by
   * throwing `new AppError(status, 'GITHUB_ACCOUNT_CONFLICT', ...)`; a route maps generic codes,
   * e.g. `{ SERVICE_UNAVAILABLE: 'github_unavailable' }`. Unexpected errors always become `unexpected`.
   */
  errorCodes?: Readonly<Record<string, string>>;
  /** Cookies set on every error redirect, e.g. clearing a short-lived OAuth state cookie. */
  errorCookies?: readonly string[];
}

const HTTP_FOUND = 302;
const UNEXPECTED_ERROR_CODE = 'unexpected';
const FALLBACK_LOCATION = '/';
// Placeholder origin used only to add the query parameter to a relative path.
const PARSE_BASE = 'http://redirect.invalid';

function redirect(location: string, cookies: readonly string[] = []): Response {
  const headers = cookieHeaders(cookies);
  headers.set('location', location);
  headers.set('cache-control', 'no-store');

  return new Response(null, { status: HTTP_FOUND, headers });
}

function errorLocation(errorRedirect: string, code: string): string {
  const url = new URL(errorRedirect, PARSE_BASE);
  url.searchParams.set('error', code);

  return `${url.pathname}${url.search}`;
}

/**
 * Wraps a route that a browser navigates to (top-level GET, e.g. OAuth start and callback):
 * request scope like `apiHandler`, but no JSON envelope and no CSRF header. The handler returns
 * where to go and which cookies to set; every failure becomes a 302 to `errorRedirect?error=<code>`.
 */
export function redirectHandler<P extends RouteParams = RouteParams>(
  handler: (args: HandlerArgs<P>) => Promise<RedirectResult>,
  { errorRedirect, errorCodes = {}, errorCookies = [] }: RedirectHandlerOptions,
): (req: Request, context: { params: Promise<P> }) => Promise<Response> {
  return async (req, context) => {
    try {
      const params = await context.params;
      const result = await withScope((cradle) => handler({ req, params, cradle }));

      if ('externalLocation' in result) {
        return redirect(result.externalLocation.href, result.cookies);
      }

      return redirect(safeReturnTo(result.location, FALLBACK_LOCATION), result.cookies);
    } catch (error) {
      const appError = toAppError(error);

      if (!appError) {
        logger.error({ err: error, method: req.method, path: new URL(req.url).pathname }, 'Unhandled redirect error');
      }

      const code = appError ? (errorCodes[appError.code] ?? appError.code.toLowerCase()) : UNEXPECTED_ERROR_CODE;

      return redirect(errorLocation(errorRedirect, code), errorCookies);
    }
  };
}
