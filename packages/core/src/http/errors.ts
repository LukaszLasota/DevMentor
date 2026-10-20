export type FieldErrors = Record<string, string[]>;

/**
 * Base for every error a service may throw. `apiHandler` maps it to an HTTP status
 * and the JSON envelope; services never build HTTP responses themselves.
 */
export class AppError extends Error {
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
