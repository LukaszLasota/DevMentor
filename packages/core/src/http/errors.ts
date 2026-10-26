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

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict.', options?: ErrorOptions) {
    super(409, 'CONFLICT', message, options);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable.', options?: ErrorOptions) {
    super(503, 'SERVICE_UNAVAILABLE', message, options);
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
