import { z } from 'zod';
import { withScope } from '../container/container';
import type { Cradle } from '../container/cradle';
import { logger } from '../logger';
import { AppError, ForbiddenError, ValidationError } from './errors';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type ApiFailure, type ApiResult } from './envelope';
import { toFieldErrors } from './parse';

type RouteParams = Record<string, string | string[] | undefined>;

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
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const INTERNAL_ERROR_MESSAGE = 'Internal server error.';

function json<T>(body: ApiResult<T>, status: number): Response {
  return Response.json(body, { status });
}

function assertCsrfHeader(req: Request): void {
  if (STATE_CHANGING_METHODS.has(req.method) && req.headers.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
    throw new ForbiddenError('Missing or invalid CSRF header.');
  }
}

function toAppError(error: unknown): AppError | undefined {
  if (error instanceof AppError) {
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
        ...(appError instanceof ValidationError ? { fieldErrors: appError.fieldErrors } : {}),
      },
    };

    return json(body, appError.status);
  }

  // Unexpected failure: log with context, never send the stack or message to the client.
  logger.error({ err: error, method: req.method, path: new URL(req.url).pathname }, 'Unhandled API error');

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
  const { successStatus = 200, csrf = true } = options;

  return async (req, context) => {
    try {
      if (csrf) {
        assertCsrfHeader(req);
      }

      const params = await context.params;
      const data = await withScope((cradle) => handler({ req, params, cradle }));

      return json({ ok: true, data }, successStatus);
    } catch (error) {
      return toErrorResponse(error, req);
    }
  };
}
