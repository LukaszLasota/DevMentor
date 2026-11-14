// Client mirror of the JSON envelope declared in @devmentor/core/http (ui must not
// import core). Keep both shapes and the CSRF header in sync.
export type FieldErrors = Record<string, string[]>;

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

export const CSRF_HEADER = "x-devmentor-request";
export const CSRF_HEADER_VALUE = "1";

/** Key under which form-level (non-field) validation messages arrive. */
export const FORM_ERRORS_KEY = "_root";
