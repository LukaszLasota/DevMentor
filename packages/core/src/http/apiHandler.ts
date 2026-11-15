import { z } from 'zod';
import { withScope } from '../container/container';
import type { Cradle } from '../container/cradle';
import { logger, redactPath } from '../logger';
import {
  ForbiddenError,
  isAppError,
  isTooManyRequestsError,
  isValidationError,
  ValidationError,
  type AppError,
} from './errors';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type ApiFailure, type ApiResult } from './envelope';
import { toFieldErrors } from './parse';

export type RouteParams = Record<string, string | string[] | undefined>;

export interface HandlerArgs<P extends RouteParams> {
  req: Request;
  params: P;
  cradle: Cradle;
}

export interface ApiHandlerOptions {
  /** HTTP status of a successful response. Default: 200. */
  successStatus?: number;
  /**
   * Require the CSRF header on state-changing methods. Default: true.
   * Turn off only for endpoints called by third parties (e.g. payment webhooks).
   */
  csrf?: boolean;
  /**
   * Extra headers on every response of the route, success and error alike
   * (e.g. `Cache-Control: no-store`). Cookies go through `withCookies`, not here.
   */
  headers?: Record<string, string>;
}

const RESPONSE_COOKIES = Symbol('responseCookies');

/** Handler result that also sets cookies; build it with `withCookies`. */
export interface WithCookies<T> {
  readonly data: T;
  readonly [RESPONSE_COOKIES]: readonly string[];
}

/**
 * Lets a handler set cookies (`Set-Cookie` values, e.g. from `sessionCookie`) while `apiHandler`
 * still sends the usual `{ ok: true, data }` envelope.
 */
export function withCookies<T>(data: T, cookies: readonly string[]): WithCookies<T> {
  return { data, [RESPONSE_COOKIES]: cookies };
}

function isWithCookies(value: unknown): value is WithCookies<unknown> {
  return typeof value === 'object' && value !== null && RESPONSE_COOKIES in value;
}

/** Response headers carrying one `Set-Cookie` per cookie. */
export function cookieHeaders(cookies: readonly string[]): Headers {
  const headers = new Headers();

  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }

  return headers;
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const INTERNAL_ERROR_MESSAGE = 'Internal server error.';

function json<T>(body: ApiResult<T>, status: number, headers: Headers = new Headers()): Response {
  return Response.json(body, { status, headers });
}

/** `extra` added to `headers` (returned for chaining). */
function withHeaders(headers: Headers, extra: Record<string, string>): Headers {
  for (const [name, value] of Object.entries(extra)) {
    headers.set(name, value);
  }

  return headers;
}

function assertCsrfHeader(req: Request): void {
  if (STATE_CHANGING_METHODS.has(req.method) && req.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new ForbiddenError('Missing or invalid CSRF header.');
  }
}

/**
 * `AppError` as is, `ZodError` as `ValidationError`; anything else is unexpected (`undefined`).
 * Both checks work across server bundles: `isAppError` checks a registry symbol, and zod 4's
 * `instanceof` checks the error's `_zod.traits`, not the class identity.
 */
export function toAppError(error: unknown): AppError | undefined {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new ValidationError('Invalid request.', toFieldErrors(error), { cause: error });
  }

  return undefined;
}

function toErrorResponse(error: unknown, req: Request): Response {
  const appError = toAppError(error);

  if (appError) {
    const body: ApiFailure = {
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        ...(isValidationError(appError) ? { fieldErrors: appError.fieldErrors } : {}),
        ...(isTooManyRequestsError(appError) ? { retryAfterSeconds: appError.retryAfterSeconds } : {}),
      },
    };

    return json(body, appError.status, new Headers(appError.headers));
  }

  // Unexpected failure: log with context, never send the stack or message to the client.
  logger.error({ err: error, method: req.method, path: redactPath(new URL(req.url).pathname) }, 'Unhandled API error');

  return json({ ok: false, error: { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE } }, 500);
}

/**
 * Wraps a route handler: CSRF check, request-scoped services, JSON envelope and
 * error mapping. Route files never write their own try/catch.
 */
export function apiHandler<T, P extends RouteParams = RouteParams>(
  handler: (args: HandlerArgs<P>) => Promise<T>,
  options: ApiHandlerOptions = {},
): (req: Request, context: { params: Promise<P> }) => Promise<Response> {
  const { successStatus = 200, csrf = true, headers = {} } = options;

  return async (req, context) => {
    try {
      if (csrf) {
        assertCsrfHeader(req);
      }

      const params = await context.params;
      const result = await withScope((cradle) => handler({ req, params, cradle }));

      if (isWithCookies(result)) {
        const responseHeaders = withHeaders(cookieHeaders(result[RESPONSE_COOKIES]), headers);

        return json({ ok: true, data: result.data }, successStatus, responseHeaders);
      }

      return json({ ok: true, data: result }, successStatus, withHeaders(new Headers(), headers));
    } catch (error) {
      const response = toErrorResponse(error, req);
      withHeaders(response.headers, headers);

      return response;
    }
  };
}
