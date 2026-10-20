import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from './errors';

describe('error hierarchy', () => {
  it.each([
    [new ValidationError(), 400, 'VALIDATION_ERROR', 'Invalid request.'],
    [new UnauthorizedError(), 401, 'UNAUTHORIZED', 'Authentication required.'],
    [new ForbiddenError(), 403, 'FORBIDDEN', 'Access denied.'],
    [new NotFoundError(), 404, 'NOT_FOUND', 'Resource not found.'],
    [new ConflictError(), 409, 'CONFLICT', 'Resource conflict.'],
    [new ServiceUnavailableError(), 503, 'SERVICE_UNAVAILABLE', 'Service unavailable.'],
  ])('%o maps to %i %s with a default message', (error, status, code, message) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status, code, message, name: error.constructor.name });
  });

  it('keeps custom messages, field errors and the cause', () => {
    const cause = new Error('root');
    const error = new ValidationError('Bad email.', { email: ['Invalid'] }, { cause });

    expect(error.message).toBe('Bad email.');
    expect(error.fieldErrors).toEqual({ email: ['Invalid'] });
    expect(error.cause).toBe(cause);
  });

  it('defaults ValidationError field errors to an empty object', () => {
    expect(new ValidationError().fieldErrors).toEqual({});
  });
});
