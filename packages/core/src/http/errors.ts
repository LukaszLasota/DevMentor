export type FieldErrors = Record<string, string[]>;

// Next bundles route handlers and pages separately, each with its own copy of this module, while
// the DI container (and so every service) is one per process, built by whichever bundle came
// first. An `AppError` thrown by a service may therefore come from another copy of the class and
// fail `instanceof`. A registry symbol is the same in every copy: recognise errors with
// `isAppError`, never with `instanceof AppError` or a subclass.
const APP_ERROR_BRAND = Symbol.for('devmentor.app-error');

/**
 * Base for every error a service may throw. `apiHandler` maps it to an HTTP status
 * and the JSON envelope; services never build HTTP responses themselves.
 */
export class AppError extends Error {
  readonly [APP_ERROR_BRAND] = true;
  /** Extra response headers `apiHandler` copies onto the error response (e.g. `Retry-After`). */
  readonly headers?: Readonly<Record<string, string>>;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Invalid request.',
    readonly fieldErrors: FieldErrors = {},
    options?: ErrorOptions,
  ) {
    super(400, 'VALIDATION_ERROR', message, options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', options?: ErrorOptions) {
    super(401, 'UNAUTHORIZED', message, options);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied.', options?: ErrorOptions) {
    super(403, 'FORBIDDEN', message, options);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', options?: ErrorOptions) {
    super(404, 'NOT_FOUND', message, options);
  }
}

/** `code` names a specific case for clients (e.g. `SLOT_TAKEN`); additive — the default stays. */
export type CodedErrorOptions = ErrorOptions & { code?: string };

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict.', options?: CodedErrorOptions) {
    super(409, options?.code ?? 'CONFLICT', message, options);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable.', options?: CodedErrorOptions) {
    super(503, options?.code ?? 'SERVICE_UNAVAILABLE', message, options);
  }
}

export class TooManyRequestsError extends AppError {
  override readonly headers: Readonly<Record<string, string>>;

  /**
   * Generic message on purpose: it never says which limit (IP or email) was hit, so it does not
   * reveal whether an account exists. `retryAfterSeconds` goes out as `Retry-After` and in the envelope.
   */
  constructor(
    readonly retryAfterSeconds: number,
    message = 'Too many attempts. Try again later.',
    options?: ErrorOptions,
  ) {
    super(429, 'TOO_MANY_REQUESTS', message, options);
    this.headers = { 'Retry-After': String(retryAfterSeconds) };
  }
}

/** `AppError` (or a subclass) from any copy of this module — see `APP_ERROR_BRAND`. */
export function isAppError(value: unknown): value is AppError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<Record<PropertyKey, unknown>>;

  return (
    candidate[APP_ERROR_BRAND] === true &&
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

/** `ValidationError` from any copy of this module: its code plus a `fieldErrors` object. */
export function isValidationError(value: unknown): value is ValidationError {
  return (
    isAppError(value) &&
    value.code === 'VALIDATION_ERROR' &&
    typeof (value as Partial<ValidationError>).fieldErrors === 'object' &&
    (value as Partial<ValidationError>).fieldErrors !== null
  );
}

/** `TooManyRequestsError` from any copy of this module: its code plus a numeric `retryAfterSeconds`. */
export function isTooManyRequestsError(value: unknown): value is TooManyRequestsError {
  return (
    isAppError(value) &&
    value.code === 'TOO_MANY_REQUESTS' &&
    typeof (value as Partial<TooManyRequestsError>).retryAfterSeconds === 'number'
  );
}
