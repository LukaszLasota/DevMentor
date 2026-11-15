import type { FieldErrors } from './errors';

// JSON envelope of every /api/* response. The client mirrors this shape in
// @devmentor/ui (ui must not import core), so keep both in sync.
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: FieldErrors;
    /** Set on 429 `TOO_MANY_REQUESTS`; the same value as the `Retry-After` header. */
    retryAfterSeconds?: number;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/** Custom header that `apiCall` always sends; plain cross-site form posts cannot set it. */
export const CSRF_HEADER = 'x-devmentor-request';
export const CSRF_HEADER_VALUE = '1';
